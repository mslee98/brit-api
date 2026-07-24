import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { GenderCode } from './domain/enums/gender-code.enum';
import { IdentityVerificationProvider } from './domain/enums/identity-verification-provider.enum';
import { MobileCarrier } from './domain/enums/mobile-carrier.enum';
import { UserBankAccountStatus } from './domain/enums/user-bank-account-status.enum';
import { UserRoleType } from './domain/enums/user-role.enum';
import { UserStatus } from './domain/enums/user-status.enum';
import { IdentityVerificationEntity } from './infrastructure/entities/identity-verification.entity';
import { UserBankAccountEntity } from './infrastructure/entities/user-bank-account.entity';
import { UserConsentEntity } from './infrastructure/entities/user-consent.entity';
import { UserProfileEntity } from './infrastructure/entities/user-profile.entity';
import { UserRoleEntity } from './infrastructure/entities/user-role.entity';
import { UserEntity } from './infrastructure/entities/user.entity';

export type CreateUserInTransactionInput = {
  loginId: string;
  passwordHash: string;
  phoneE164: string;
  name: string;
  birthDate: string;
  genderCode: GenderCode;
  mobileCarrier: MobileCarrier;
  nickname: string;
  identityKeyHash: string;
  octomoRequestId: string;
  phoneVerifiedAt: Date;
  identityVerifiedAt: Date;
  transactionPinHash: string;
  bankCode: string;
  accountNumberEncrypted: string;
  accountNumberHash: string;
  accountNumberMasked: string;
  holderName: string;
  bankAccountVerifiedAt: Date;
  consents: {
    service: boolean;
    privacy: boolean;
    identity: boolean;
    marketing: boolean;
    agreedAt: Date;
  };
};

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

  async getPrimaryRole(userId: string): Promise<UserRoleType> {
    const role = await this.roleRepository.findOne({
      where: { userId },
      order: { grantedAt: 'ASC' },
    });
    return role?.role ?? UserRoleType.CONSUMER;
  }

  async createUserInTransaction(
    manager: EntityManager,
    input: CreateUserInTransactionInput,
  ): Promise<UserEntity> {
    const userRepository = manager.getRepository(UserEntity);
    const profileRepository = manager.getRepository(UserProfileEntity);
    const roleRepository = manager.getRepository(UserRoleEntity);
    const identityRepository = manager.getRepository(
      IdentityVerificationEntity,
    );
    const bankAccountRepository = manager.getRepository(UserBankAccountEntity);
    const consentRepository = manager.getRepository(UserConsentEntity);

    const user = userRepository.create({
      loginId: input.loginId.toLowerCase(),
      passwordHash: input.passwordHash,
      phoneE164: input.phoneE164,
      status: UserStatus.ACTIVE,
      lastLoginAt: new Date(),
    });
    await userRepository.save(user);

    const profile = profileRepository.create({
      userId: user.id,
      name: input.name,
      birthDate: input.birthDate,
      genderCode: input.genderCode,
      mobileCarrier: input.mobileCarrier,
      nickname: input.nickname,
      identityKeyHash: input.identityKeyHash,
      octomoRequestId: input.octomoRequestId,
      phoneVerifiedAt: input.phoneVerifiedAt,
      identityVerifiedAt: input.identityVerifiedAt,
      transactionPinHash: input.transactionPinHash,
    });
    await profileRepository.save(profile);

    const role = roleRepository.create({
      userId: user.id,
      role: UserRoleType.CONSUMER,
      grantedBy: null,
    });
    await roleRepository.save(role);

    const identity = identityRepository.create({
      userId: user.id,
      provider: IdentityVerificationProvider.OCTOMO,
      requestId: input.octomoRequestId,
      phoneE164: input.phoneE164,
      verifiedAt: input.identityVerifiedAt,
    });
    await identityRepository.save(identity);

    const bankAccount = bankAccountRepository.create({
      userId: user.id,
      bankCode: input.bankCode,
      accountNumberEncrypted: input.accountNumberEncrypted,
      accountNumberHash: input.accountNumberHash,
      accountNumberMasked: input.accountNumberMasked,
      holderName: input.holderName,
      status: UserBankAccountStatus.ACTIVE,
      verifiedAt: input.bankAccountVerifiedAt,
    });
    await bankAccountRepository.save(bankAccount);

    const consent = consentRepository.create({
      userId: user.id,
      service: input.consents.service,
      privacy: input.consents.privacy,
      identity: input.consents.identity,
      marketing: input.consents.marketing,
      agreedAt: input.consents.agreedAt,
    });
    await consentRepository.save(consent);

    return user;
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLoginAt: new Date() });
  }
}
