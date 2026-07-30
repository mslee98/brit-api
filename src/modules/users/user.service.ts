import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { GenderCode } from './domain/enums/gender-code.enum';
import { MobileCarrier } from './domain/enums/mobile-carrier.enum';
import { ConsentType } from './domain/enums/consent-type.enum';
import { RoleGrantStatus } from './domain/enums/role-grant-status.enum';
import { UserBankAccountStatus } from './domain/enums/user-bank-account-status.enum';
import { UserRole } from './domain/enums/user-role.enum';
import { UserStatus } from './domain/enums/user-status.enum';
import { CoinWalletStatus } from './domain/enums/coin-wallet-status.enum';
import { UserBankAccountEntity } from './infrastructure/entities/user-bank-account.entity';
import { UserCoinWalletEntity } from './infrastructure/entities/user-coin-wallet.entity';
import { UserConsentEntity } from './infrastructure/entities/user-consent.entity';
import { UserProfileEntity } from './infrastructure/entities/user-profile.entity';
import { UserRoleEntity } from './infrastructure/entities/user-role.entity';
import { UserEntity } from './infrastructure/entities/user.entity';

/**
 * 가입 트랜잭션에 넘기는 동의 1건.
 * evidence는 IP/UA 등 증빙용 JSON (현재 signup은 기본 {}).
 */
export type CreateUserConsentInput = {
  consentType: ConsentType;
  documentVersion: string;
  isAgreed: boolean;
  agreedAt: Date | null;
  evidence?: Record<string, unknown>;
};

/**
 * AuthService.signup → createUserInTransaction 입력.
 * password/pin은 이미 해시된 값, 계좌번호는 이미 암호화된 Buffer.
 */
export type CreateUserInTransactionInput = {
  loginId: string;
  passwordHash: string;
  phoneE164: string;
  name: string;
  residentRegistrationNumber: string;
  birthDate: string;
  genderCode: GenderCode;
  mobileCarrier: MobileCarrier;
  nickname: string | null;
  pinHash: string;
  bankCode: string;
  accountNumberEncrypted: Buffer;
  accountNumberHash: string;
  accountNumberMasked: string;
  holderName: string;
  consents: CreateUserConsentInput[];
};

/**
 * UsersModule 도메인 서비스.
 * Auth는 User Entity를 직접 쓰지 말고 이 서비스를 통해 생성·조회한다.
 *
 * 주요 진입점:
 * - createUserInTransaction: 가입 시 users+profile+role+bank+consents+wallet
 * - getPrimaryRole: JWT role용 ACTIVE 역할 조회
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly profileRepository: Repository<UserProfileEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly roleRepository: Repository<UserRoleEntity>,
  ) {}

  async existsByLoginId(loginId: string): Promise<boolean> {
    const count = await this.userRepository.count({
      where: { loginId: loginId.toLowerCase() },
    });
    return count > 0;
  }

  async existsByNickname(nickname: string): Promise<boolean> {
    const count = await this.profileRepository.count({
      where: { nickname },
    });
    return count > 0;
  }

  async findByLoginId(loginId: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { loginId: loginId.toLowerCase() },
    });
  }

  async findById(userId: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async getNicknameByUserId(userId: string): Promise<string | null> {
    const profile = await this.profileRepository.findOne({
      where: { userId },
      select: ['nickname'],
    });
    return profile?.nickname ?? null;
  }

  async getPrimaryRole(userId: string): Promise<UserRole> {
    const role = await this.roleRepository.findOne({
      where: { userId, status: RoleGrantStatus.ACTIVE },
      order: { grantedAt: 'ASC' },
    });
    return role?.role ?? UserRole.USER;
  }

  /**
   * 가입 단일 트랜잭션 저장.
   * 순서: user(PENDING) → profile → role(USER) → bank(PENDING_APPROVAL)
   *      → consents[] → wallet(0잔액).
   * 세션·승인 이력은 만들지 않는다 (승인 후 로그인 / 관리자 API).
   */
  async createUserInTransaction(
    manager: EntityManager,
    input: CreateUserInTransactionInput,
  ): Promise<UserEntity> {
    const userRepository = manager.getRepository(UserEntity);
    const profileRepository = manager.getRepository(UserProfileEntity);
    const roleRepository = manager.getRepository(UserRoleEntity);
    const bankAccountRepository = manager.getRepository(UserBankAccountEntity);
    const consentRepository = manager.getRepository(UserConsentEntity);
    const walletRepository = manager.getRepository(UserCoinWalletEntity);

    const user = userRepository.create({
      loginId: input.loginId.toLowerCase(),
      passwordHash: input.passwordHash,
      phoneE164: input.phoneE164,
      status: UserStatus.PENDING,
      registrationSubmittedAt: new Date(),
    });
    await userRepository.save(user);

    const profile = profileRepository.create({
      userId: user.id,
      name: input.name,
      residentRegistrationNumber: input.residentRegistrationNumber,
      birthDate: input.birthDate,
      genderCode: input.genderCode,
      mobileCarrier: input.mobileCarrier,
      nickname: input.nickname,
      pinHash: input.pinHash,
    });
    await profileRepository.save(profile);

    const role = roleRepository.create({
      userId: user.id,
      role: UserRole.USER,
      status: RoleGrantStatus.ACTIVE,
      grantedByUserId: null,
    });
    await roleRepository.save(role);

    const bankAccount = bankAccountRepository.create({
      userId: user.id,
      bankCode: input.bankCode,
      accountNumberEncrypted: input.accountNumberEncrypted,
      accountNumberHash: input.accountNumberHash,
      accountNumberMasked: input.accountNumberMasked,
      holderName: input.holderName,
      status: UserBankAccountStatus.PENDING_APPROVAL,
    });
    await bankAccountRepository.save(bankAccount);

    for (const consentInput of input.consents) {
      const consent = consentRepository.create({
        userId: user.id,
        consentType: consentInput.consentType,
        documentVersion: consentInput.documentVersion,
        isAgreed: consentInput.isAgreed,
        agreedAt: consentInput.agreedAt,
        evidence: consentInput.evidence ?? {},
      });
      await consentRepository.save(consent);
    }

    const wallet = walletRepository.create({
      userId: user.id,
      nonSellableBalance: '0',
      sellableBalance: '0',
      lockedNonSellableBalance: '0',
      lockedSellableBalance: '0',
      pendingSellableBalance: '0',
      status: CoinWalletStatus.ACTIVE,
    });
    await walletRepository.save(wallet);

    return user;
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLoginAt: new Date() });
  }
}
