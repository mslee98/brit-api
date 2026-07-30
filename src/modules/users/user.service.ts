import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import { NotificationService } from '../notifications/notification.service';
import { ApprovalDecision } from './domain/enums/approval-decision.enum';
import { BankAccountReviewDecision } from './domain/enums/bank-account-review-decision.enum';
import { GenderCode } from './domain/enums/gender-code.enum';
import { MobileCarrier } from './domain/enums/mobile-carrier.enum';
import { ConsentType } from './domain/enums/consent-type.enum';
import { RoleGrantStatus } from './domain/enums/role-grant-status.enum';
import { UserBankAccountStatus } from './domain/enums/user-bank-account-status.enum';
import { UserRole } from './domain/enums/user-role.enum';
import { UserStatus } from './domain/enums/user-status.enum';
import { CoinWalletStatus } from './domain/enums/coin-wallet-status.enum';
import {
  ApproveUserRegistrationDto,
  RejectUserRegistrationDto,
} from './dto/approve-user-registration.dto';
import {
  UserApprovalDetailDto,
  UserApprovalListItemDto,
} from './dto/user-approval-response.dto';
import { UserApprovalDomainException } from './exceptions/user-approval.exceptions';
import { UserApprovalReviewEntity } from './infrastructure/entities/user-approval-review.entity';
import { UserBankAccountReviewEntity } from './infrastructure/entities/user-bank-account-review.entity';
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
 * - approveRegistration / rejectRegistration: 관리자 심사
 * - getPrimaryRole: JWT role용 ACTIVE 역할 조회
 */
@Injectable()
export class UserService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly profileRepository: Repository<UserProfileEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly roleRepository: Repository<UserRoleEntity>,
    @InjectRepository(UserBankAccountEntity)
    private readonly bankAccountRepository: Repository<UserBankAccountEntity>,
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
   * ACTIVE 상태이며 ADMIN/SYS_ADMIN 역할이 ACTIVE인 사용자 id 목록.
   * 가입 알림 수신자 조회용. 0명이어도 가입은 성공한다.
   */
  async findActiveAdminUserIds(
    manager?: EntityManager,
  ): Promise<string[]> {
    const roleRepository = manager
      ? manager.getRepository(UserRoleEntity)
      : this.roleRepository;

    const rows = await roleRepository
      .createQueryBuilder('role')
      .innerJoin(UserEntity, 'adminUser', 'adminUser.id = role.userId')
      .where('role.role IN (:...roles)', {
        roles: [UserRole.ADMIN, UserRole.SYS_ADMIN],
      })
      .andWhere('role.status = :roleStatus', {
        roleStatus: RoleGrantStatus.ACTIVE,
      })
      .andWhere('adminUser.status = :userStatus', {
        userStatus: UserStatus.ACTIVE,
      })
      .select('role.userId', 'userId')
      .distinct(true)
      .getRawMany<{ userId: string }>();

    return rows.map((row) => row.userId);
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

  async listPendingApprovals(
    page: number,
    size: number,
  ): Promise<{ items: UserApprovalListItemDto[]; pagination: PaginationMeta }> {
    const [users, totalItems] = await this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.profile', 'profile')
      .where('user.status = :status', { status: UserStatus.PENDING })
      .orderBy('user.registrationSubmittedAt', 'ASC')
      .skip((page - 1) * size)
      .take(size)
      .getManyAndCount();

    const userIds = users.map((user) => user.id);
    const pendingBanks =
      userIds.length === 0
        ? []
        : await this.bankAccountRepository
            .createQueryBuilder('bank')
            .where('bank.userId IN (:...userIds)', { userIds })
            .andWhere('bank.status = :status', {
              status: UserBankAccountStatus.PENDING_APPROVAL,
            })
            .orderBy('bank.requestedAt', 'ASC')
            .getMany();

    const bankByUserId = new Map<string, UserBankAccountEntity>();
    for (const bank of pendingBanks) {
      if (!bankByUserId.has(bank.userId)) {
        bankByUserId.set(bank.userId, bank);
      }
    }

    return {
      items: users.map((user) =>
        this.toListItem(user, user.profile, bankByUserId.get(user.id) ?? null),
      ),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getApprovalDetail(userId: string): Promise<UserApprovalDetailDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { profile: true },
    });
    if (!user?.profile) {
      throw UserApprovalDomainException.notFound();
    }

    let bankAccount: UserBankAccountEntity | null = null;
    if (user.status === UserStatus.PENDING) {
      bankAccount = await this.bankAccountRepository.findOne({
        where: {
          userId,
          status: UserBankAccountStatus.PENDING_APPROVAL,
        },
        order: { requestedAt: 'ASC' },
      });
    }
    if (!bankAccount) {
      bankAccount = await this.bankAccountRepository.findOne({
        where: { userId },
        order: { requestedAt: 'DESC' },
      });
    }

    return this.toDetail(user, user.profile, bankAccount);
  }

  async approveRegistration(
    adminUserId: string,
    userId: string,
    dto: ApproveUserRegistrationDto,
  ): Promise<{ id: string; status: UserStatus }> {
    if (
      !dto.identityChecked ||
      !dto.phoneChecked ||
      !dto.bankAccountChecked ||
      !dto.holderNameMatched
    ) {
      throw UserApprovalDomainException.checklistIncomplete();
    }

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(UserEntity);
      const bankAccountRepository = manager.getRepository(
        UserBankAccountEntity,
      );
      const approvalReviewRepository = manager.getRepository(
        UserApprovalReviewEntity,
      );
      const bankReviewRepository = manager.getRepository(
        UserBankAccountReviewEntity,
      );

      const user = await userRepository.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw UserApprovalDomainException.notFound();
      }
      if (user.status !== UserStatus.PENDING) {
        throw UserApprovalDomainException.notPending();
      }

      const bankAccount = await bankAccountRepository.findOne({
        where: {
          userId,
          status: UserBankAccountStatus.PENDING_APPROVAL,
        },
        order: { requestedAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bankAccount) {
        throw UserApprovalDomainException.bankAccountNotFound();
      }

      const now = new Date();
      const reviewReason = dto.reviewReason?.trim() || null;

      const approvalReview = approvalReviewRepository.create({
        userId,
        bankAccountId: bankAccount.id,
        decision: ApprovalDecision.APPROVED,
        identityChecked: true,
        phoneChecked: true,
        bankAccountChecked: true,
        holderNameMatched: true,
        reviewedByUserId: adminUserId,
        reviewReason,
        reviewedAt: now,
      });
      await approvalReviewRepository.save(approvalReview);

      user.status = UserStatus.ACTIVE;
      user.approvedAt = now;
      user.approvedByUserId = adminUserId;
      user.rejectedAt = null;
      user.rejectionReason = null;
      await userRepository.save(user);

      const previousStatus = bankAccount.status;
      bankAccount.status = UserBankAccountStatus.ACTIVE;
      bankAccount.reviewedAt = now;
      bankAccount.reviewedByUserId = adminUserId;
      bankAccount.activatedAt = now;
      bankAccount.rejectionReason = null;
      await bankAccountRepository.save(bankAccount);

      const bankReview = bankReviewRepository.create({
        bankAccountId: bankAccount.id,
        userId,
        previousStatus,
        decision: BankAccountReviewDecision.APPROVED,
        resultingStatus: UserBankAccountStatus.ACTIVE,
        reviewedByUserId: adminUserId,
        reviewReason,
        reviewedAt: now,
      });
      await bankReviewRepository.save(bankReview);

      await this.notificationService.createRegistrationApprovedInTransaction(
        manager,
        {
          adminUserId,
          applicantUserId: userId,
          approvalReviewId: approvalReview.id,
        },
      );

      return { id: user.id, status: user.status };
    });
  }

  async rejectRegistration(
    adminUserId: string,
    userId: string,
    dto: RejectUserRegistrationDto,
  ): Promise<{ id: string; status: UserStatus }> {
    const rejectionReason = dto.rejectionReason.trim();
    if (!rejectionReason) {
      throw UserApprovalDomainException.rejectionReasonRequired();
    }

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(UserEntity);
      const bankAccountRepository = manager.getRepository(
        UserBankAccountEntity,
      );
      const approvalReviewRepository = manager.getRepository(
        UserApprovalReviewEntity,
      );
      const bankReviewRepository = manager.getRepository(
        UserBankAccountReviewEntity,
      );

      const user = await userRepository.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw UserApprovalDomainException.notFound();
      }
      if (user.status !== UserStatus.PENDING) {
        throw UserApprovalDomainException.notPending();
      }

      const bankAccount = await bankAccountRepository.findOne({
        where: {
          userId,
          status: UserBankAccountStatus.PENDING_APPROVAL,
        },
        order: { requestedAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bankAccount) {
        throw UserApprovalDomainException.bankAccountNotFound();
      }

      const now = new Date();

      const approvalReview = approvalReviewRepository.create({
        userId,
        bankAccountId: bankAccount.id,
        decision: ApprovalDecision.REJECTED,
        identityChecked: dto.identityChecked ?? false,
        phoneChecked: dto.phoneChecked ?? false,
        bankAccountChecked: dto.bankAccountChecked ?? false,
        holderNameMatched: dto.holderNameMatched ?? false,
        reviewedByUserId: adminUserId,
        reviewReason: rejectionReason,
        reviewedAt: now,
      });
      await approvalReviewRepository.save(approvalReview);

      user.status = UserStatus.REJECTED;
      user.rejectedAt = now;
      user.rejectionReason = rejectionReason;
      user.approvedAt = null;
      user.approvedByUserId = null;
      await userRepository.save(user);

      const previousStatus = bankAccount.status;
      bankAccount.status = UserBankAccountStatus.REJECTED;
      bankAccount.reviewedAt = now;
      bankAccount.reviewedByUserId = adminUserId;
      bankAccount.rejectionReason = rejectionReason;
      await bankAccountRepository.save(bankAccount);

      const bankReview = bankReviewRepository.create({
        bankAccountId: bankAccount.id,
        userId,
        previousStatus,
        decision: BankAccountReviewDecision.REJECTED,
        resultingStatus: UserBankAccountStatus.REJECTED,
        reviewedByUserId: adminUserId,
        reviewReason: rejectionReason,
        reviewedAt: now,
      });
      await bankReviewRepository.save(bankReview);

      await this.notificationService.createRegistrationRejectedInTransaction(
        manager,
        {
          adminUserId,
          applicantUserId: userId,
          approvalReviewId: approvalReview.id,
        },
      );

      return { id: user.id, status: user.status };
    });
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLoginAt: new Date() });
  }

  private toListItem(
    user: UserEntity,
    profile: UserProfileEntity,
    bankAccount: UserBankAccountEntity | null,
  ): UserApprovalListItemDto {
    return {
      id: user.id,
      loginId: user.loginId,
      phoneE164: user.phoneE164,
      status: user.status,
      registrationSubmittedAt: user.registrationSubmittedAt,
      name: profile.name,
      nickname: profile.nickname,
      bankAccount: bankAccount
        ? {
            id: bankAccount.id,
            bankCode: bankAccount.bankCode,
            accountNumberMasked: bankAccount.accountNumberMasked,
            holderName: bankAccount.holderName,
            status: bankAccount.status,
          }
        : null,
    };
  }

  private toDetail(
    user: UserEntity,
    profile: UserProfileEntity,
    bankAccount: UserBankAccountEntity | null,
  ): UserApprovalDetailDto {
    return {
      ...this.toListItem(user, profile, bankAccount),
      residentRegistrationNumberMasked: maskResidentRegistrationNumber(
        profile.residentRegistrationNumber,
      ),
      birthDate: profile.birthDate,
      genderCode: profile.genderCode,
      mobileCarrier: profile.mobileCarrier,
      approvedAt: user.approvedAt,
      approvedByUserId: user.approvedByUserId,
      rejectedAt: user.rejectedAt,
      rejectionReason: user.rejectionReason,
    };
  }
}

function maskResidentRegistrationNumber(rrn: string): string {
  const digits = rrn.replace(/\D/g, '');
  if (digits.length < 6) {
    return '*******';
  }
  return `${digits.slice(0, 6)}*******`;
}
