import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import {
  buildPaginationMeta,
  PaginationMeta,
} from '../../common/dto/pagination-query.dto';
import {
  decryptAccountNumber,
  encryptAccountNumber,
  hashAccountNumber,
  maskAccountNumber,
} from '../../common/utils/account-crypto.util';
import { AuthService } from '../auth/auth.service';
import { UpdateRegistrationDto } from '../auth/dto/update-registration.dto';
import { BankEntity } from '../banks/infrastructure/entities/bank.entity';
import { CoinService } from '../coins/coin.service';
import { CoinWalletStatus } from '../coins/domain/enums/coin-wallet-status.enum';
import { CoinWalletResponseDto } from '../coins/dto/coin-response.dto';
import { NotificationEventType } from '../notifications/domain/enums/notification-event-type.enum';
import { NotificationReferenceType } from '../notifications/domain/enums/notification-reference-type.enum';
import { NotificationService } from '../notifications/notification.service';
import { TradeDisputeResolution } from '../trades/domain/enums/trade-dispute-resolution.enum';
import { TradeDisputeStatus } from '../trades/domain/enums/trade-dispute-status.enum';
import { TradeStatus } from '../trades/domain/enums/trade-status.enum';
import { TradeDisputeEntity } from '../trades/infrastructure/entities/trade-dispute.entity';
import { TradeEntity } from '../trades/infrastructure/entities/trade.entity';
import {
  summarizeAdminDisputeRows,
  summarizeAdminTradeRows,
} from './admin-ops-snapshot.util';
import { ApprovalDecision } from './domain/enums/approval-decision.enum';
import { BankAccountReviewDecision } from './domain/enums/bank-account-review-decision.enum';
import { GenderCode } from './domain/enums/gender-code.enum';
import { MobileCarrier } from './domain/enums/mobile-carrier.enum';
import { ConsentType } from './domain/enums/consent-type.enum';
import { RoleGrantStatus } from './domain/enums/role-grant-status.enum';
import { UserBankAccountStatus } from './domain/enums/user-bank-account-status.enum';
import { UserRole } from './domain/enums/user-role.enum';
import { UserStatus } from './domain/enums/user-status.enum';
import {
  AdminUserDetailDto,
  AdminUserListItemDto,
} from './dto/admin-user-response.dto';
import {
  AdminUserOpsSnapshotDto,
  AdminWalletStatusView,
} from './dto/admin-user-ops-snapshot.dto';
import {
  AdminPartyDto,
  type AdminPartySummary,
} from './dto/admin-party.dto';
import {
  ApproveUserRegistrationDto,
  RegistrationRejectTarget,
  RejectUserRegistrationDto,
} from './dto/approve-user-registration.dto';
import { SearchAdminUsersDto } from './dto/search-admin-users.dto';
import { SearchRegistrationReviewsDto } from './dto/search-registration-reviews.dto';
import {
  UserApprovalDetailDto,
  UserApprovalListItemDto,
} from './dto/user-approval-response.dto';
import { UserAdminDomainException } from './exceptions/user-admin.exceptions';
import { UserApprovalDomainException } from './exceptions/user-approval.exceptions';
import { UserApprovalReviewEntity } from './infrastructure/entities/user-approval-review.entity';
import { UserBankAccountReviewEntity } from './infrastructure/entities/user-bank-account-review.entity';
import { UserBankAccountEntity } from './infrastructure/entities/user-bank-account.entity';
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

/** Trade Snapshot용 ACTIVE 계좌 평문 */
export type ActiveBankAccountPlaintext = {
  bankAccountId: string;
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
};

/**
 * UsersModule 도메인 서비스.
 * Auth는 User Entity를 직접 쓰지 말고 이 서비스를 통해 생성·조회한다.
 *
 * 주요 진입점:
 * - createUserInTransaction: 가입 시 users+profile+role+bank+consents+wallet
 * - approveRegistration / rejectRegistration: 관리자 심사
 * - searchUsers / suspendUser / unsuspendUser / withdrawUser: 관리자 운영
 * - getPrimaryRole: JWT role용 ACTIVE 역할 조회
 */
@Injectable()
export class UserService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly coinService: CoinService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
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

  async getNameByUserId(userId: string): Promise<string | null> {
    const profile = await this.profileRepository.findOne({
      where: { userId },
      select: ['name'],
    });
    return profile?.name ?? null;
  }

  /** 관리자 P2P 화면용 구매자·판매자 요약 batch 조회 */
  async getAdminPartySummaries(
    userIds: string[],
  ): Promise<Map<string, AdminPartySummary>> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const result = new Map<string, AdminPartySummary>();
    if (uniqueIds.length === 0) {
      return result;
    }

    const rows = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin(UserProfileEntity, 'profile', 'profile.user_id = user.id')
      .select('user.id', 'userId')
      .addSelect('user.login_id', 'loginId')
      .addSelect('profile.name', 'name')
      .where('user.id IN (:...userIds)', { userIds: uniqueIds })
      .getRawMany<{ userId: string; loginId: string; name: string }>();

    for (const row of rows) {
      result.set(row.userId, {
        userId: row.userId,
        loginId: row.loginId,
        name: row.name,
      });
    }
    return result;
  }

  toAdminPartyDto(summary: AdminPartySummary | undefined): AdminPartyDto {
    return {
      userId: summary?.userId ?? '',
      loginId: summary?.loginId ?? '',
      name: summary?.name ?? '',
    };
  }

  async getPrimaryRole(userId: string): Promise<UserRole> {
    const role = await this.roleRepository.findOne({
      where: { userId, status: RoleGrantStatus.ACTIVE },
      order: { grantedAt: 'ASC' },
    });
    return role?.role ?? UserRole.USER;
  }

  /** ACTIVE ADMIN 또는 SYS_ADMIN 역할 보유 여부 */
  async hasActiveAdminRole(userId: string): Promise<boolean> {
    const count = await this.roleRepository.count({
      where: {
        userId,
        status: RoleGrantStatus.ACTIVE,
        role: In([UserRole.ADMIN, UserRole.SYS_ADMIN]),
      },
    });
    return count > 0;
  }

  /** JWT용 — SYS_ADMIN 우선, 없으면 ADMIN */
  async getHighestAdminRole(userId: string): Promise<UserRole | null> {
    const roles = await this.roleRepository.find({
      where: {
        userId,
        status: RoleGrantStatus.ACTIVE,
        role: In([UserRole.ADMIN, UserRole.SYS_ADMIN]),
      },
    });
    if (roles.some((row) => row.role === UserRole.SYS_ADMIN)) {
      return UserRole.SYS_ADMIN;
    }
    if (roles.some((row) => row.role === UserRole.ADMIN)) {
      return UserRole.ADMIN;
    }
    return null;
  }

  async listActiveRoles(userId: string): Promise<UserRole[]> {
    const rows = await this.roleRepository.find({
      where: { userId, status: RoleGrantStatus.ACTIVE },
      order: { grantedAt: 'ASC' },
    });
    return rows.map((row) => row.role);
  }

  async countActiveSysAdmins(
    manager?: EntityManager,
  ): Promise<number> {
    const roleRepository = manager
      ? manager.getRepository(UserRoleEntity)
      : this.roleRepository;

    return roleRepository
      .createQueryBuilder('role')
      .innerJoin(UserEntity, 'user', 'user.id = role.userId')
      .innerJoin(
        'admin_profiles',
        'profile',
        'profile.user_id = role.userId AND profile.is_active = true',
      )
      .where('role.role = :role', { role: UserRole.SYS_ADMIN })
      .andWhere('role.status = :status', { status: RoleGrantStatus.ACTIVE })
      .andWhere('user.status = :userStatus', { userStatus: UserStatus.ACTIVE })
      .getCount();
  }

  /**
   * ACTIVE SYS_ADMIN 역할 행을 FOR UPDATE로 잠근 뒤 수를 반환한다.
   * 마지막 SYS_ADMIN 비활성·회수 동시성 보호용.
   */
  async lockAndCountActiveSysAdmins(
    manager: EntityManager,
  ): Promise<number> {
    const rows = await manager
      .getRepository(UserRoleEntity)
      .createQueryBuilder('role')
      .innerJoin(UserEntity, 'user', 'user.id = role.userId')
      .innerJoin(
        'admin_profiles',
        'profile',
        'profile.user_id = role.userId AND profile.is_active = true',
      )
      .where('role.role = :role', { role: UserRole.SYS_ADMIN })
      .andWhere('role.status = :status', { status: RoleGrantStatus.ACTIVE })
      .andWhere('user.status = :userStatus', {
        userStatus: UserStatus.ACTIVE,
      })
      .setLock('pessimistic_write')
      .getMany();
    return rows.length;
  }

  async grantAdminRoleInTransaction(
    manager: EntityManager,
    input: {
      userId: string;
      role: UserRole.ADMIN | UserRole.SYS_ADMIN;
      grantedByUserId: string;
    },
  ): Promise<UserRoleEntity> {
    const roleRepository = manager.getRepository(UserRoleEntity);
    const existing = await roleRepository.findOne({
      where: {
        userId: input.userId,
        role: input.role,
        status: RoleGrantStatus.ACTIVE,
      },
    });
    if (existing) {
      return existing;
    }

    const revoked = await roleRepository.findOne({
      where: {
        userId: input.userId,
        role: input.role,
        status: RoleGrantStatus.REVOKED,
      },
      order: { revokedAt: 'DESC' },
    });
    if (revoked) {
      revoked.status = RoleGrantStatus.ACTIVE;
      revoked.grantedByUserId = input.grantedByUserId;
      revoked.grantedAt = new Date();
      revoked.revokedByUserId = null;
      revoked.revokedAt = null;
      revoked.revokeReason = null;
      return roleRepository.save(revoked);
    }

    const created = roleRepository.create({
      userId: input.userId,
      role: input.role,
      status: RoleGrantStatus.ACTIVE,
      grantedByUserId: input.grantedByUserId,
      grantedAt: new Date(),
      revokedByUserId: null,
      revokedAt: null,
      revokeReason: null,
    });
    return roleRepository.save(created);
  }

  async revokeAdminRoleInTransaction(
    manager: EntityManager,
    input: {
      userId: string;
      role: UserRole.ADMIN | UserRole.SYS_ADMIN;
      revokedByUserId: string;
      reason: string;
    },
  ): Promise<UserRoleEntity | null> {
    const roleRepository = manager.getRepository(UserRoleEntity);
    const existing = await roleRepository.findOne({
      where: {
        userId: input.userId,
        role: input.role,
        status: RoleGrantStatus.ACTIVE,
      },
    });
    if (!existing) {
      return null;
    }
    existing.status = RoleGrantStatus.REVOKED;
    existing.revokedByUserId = input.revokedByUserId;
    existing.revokedAt = new Date();
    existing.revokeReason = input.reason;
    return roleRepository.save(existing);
  }

  /**
   * P2P 주문 참여 조건: users.status=ACTIVE 그리고 ACTIVE 계좌 ≥ 1.
   * Orders 모듈 TX 내부에서 호출한다.
   */
  async assertP2pEligibleInTransaction(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const user = await manager.getRepository(UserEntity).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) {
      throw UserAdminDomainException.notFound();
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw UserAdminDomainException.userNotActive();
    }

    const adminRoleCount = await manager.getRepository(UserRoleEntity).count({
      where: {
        userId,
        status: RoleGrantStatus.ACTIVE,
        role: In([UserRole.ADMIN, UserRole.SYS_ADMIN]),
      },
    });
    if (adminRoleCount > 0) {
      throw UserAdminDomainException.adminP2pNotAllowed();
    }

    const activeBankCount = await manager
      .getRepository(UserBankAccountEntity)
      .count({
        where: {
          userId,
          status: UserBankAccountStatus.ACTIVE,
        },
      });
    if (activeBankCount < 1) {
      throw UserAdminDomainException.activeBankAccountRequired();
    }
  }

  /**
   * Trade 생성용 ACTIVE 계좌 Snapshot.
   * 가장 최근 활성화된 ACTIVE 계좌 1건을 복호화해 반환한다.
   */
  async getActiveBankAccountPlaintextInTransaction(
    manager: EntityManager,
    userId: string,
  ): Promise<ActiveBankAccountPlaintext | null> {
    const account = await manager.getRepository(UserBankAccountEntity).findOne({
      where: {
        userId,
        status: UserBankAccountStatus.ACTIVE,
      },
      order: { activatedAt: 'DESC', createdAt: 'DESC' },
    });
    if (!account) {
      return null;
    }

    const encryptionKey = this.configService.getOrThrow<string>(
      'ACCOUNT_ENCRYPTION_KEY',
    );
    const accountNumber = decryptAccountNumber(
      account.accountNumberEncrypted,
      encryptionKey,
    );

    return {
      bankAccountId: account.id,
      bankCode: account.bankCode,
      accountNumber,
      accountHolderName: account.holderName,
    };
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

    await this.coinService.createEmptyWalletInTransaction(manager, user.id);

    return user;
  }

  async listRegistrationReviews(
    query: SearchRegistrationReviewsDto,
  ): Promise<{ items: UserApprovalListItemDto[]; pagination: PaginationMeta }> {
    const { page, size } = query;
    const qb = this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.profile', 'profile')
      .orderBy('user.registrationSubmittedAt', 'ASC')
      .skip((page - 1) * size)
      .take(size);

    if (query.status) {
      qb.where('user.status = :status', { status: query.status });
    } else {
      qb.where('user.status IN (:...statuses)', {
        statuses: [UserStatus.PENDING, UserStatus.REJECTED, UserStatus.ACTIVE],
      });
    }

    if (query.keyword) {
      const like = `%${query.keyword}%`;
      qb.andWhere(
        '(user.loginId ILIKE :like OR profile.name ILIKE :like OR profile.nickname ILIKE :like)',
        { like },
      );
    }
    if (query.from) {
      qb.andWhere('user.registrationSubmittedAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('user.registrationSubmittedAt <= :to', { to: query.to });
    }

    const [users, totalItems] = await qb.getManyAndCount();

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

  async getRegistrationReviewDetail(
    userId: string,
  ): Promise<UserApprovalDetailDto> {
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

  async getMe(userId: string): Promise<{
    id: string;
    loginId: string;
    name: string;
    nickname: string | null;
    status: UserStatus;
    bankAccount: { status: UserBankAccountStatus | null };
    permissions: { canTrade: boolean; canUsePartnerExchange: boolean };
    nextAction: 'NONE' | 'WAIT_FOR_APPROVAL' | 'ACTION_REQUIRED';
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { profile: true },
    });
    if (!user?.profile) {
      throw UserAdminDomainException.notFound();
    }
    const latestBank = await this.bankAccountRepository.findOne({
      where: { userId },
      order: { requestedAt: 'DESC' },
    });
    const canTrade =
      user.status === UserStatus.ACTIVE &&
      latestBank?.status === UserBankAccountStatus.ACTIVE;
    return {
      id: user.id,
      loginId: user.loginId,
      name: user.profile.name,
      nickname: user.profile.nickname,
      status: user.status,
      bankAccount: { status: latestBank?.status ?? null },
      permissions: {
        canTrade: Boolean(canTrade),
        canUsePartnerExchange: Boolean(canTrade),
      },
      nextAction: this.getNextAction(user.status, latestBank?.status ?? null),
    };
  }

  async getRegistrationStatus(userId: string): Promise<{
    userStatus: UserStatus;
    bankAccountStatus: UserBankAccountStatus | null;
    registrationStatus: 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'COMPLETED';
    submittedAt: Date;
    rejection: { reason: string | null; rejectedAt: Date | null } | null;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw UserApprovalDomainException.notFound();
    }
    const latestBank = await this.bankAccountRepository.findOne({
      where: { userId },
      order: { requestedAt: 'DESC' },
    });
    return {
      userStatus: user.status,
      bankAccountStatus: latestBank?.status ?? null,
      registrationStatus: this.getRegistrationViewStatus(
        user.status,
        latestBank?.status ?? null,
      ),
      submittedAt: user.registrationSubmittedAt,
      rejection:
        user.status === UserStatus.REJECTED || latestBank?.status === UserBankAccountStatus.REJECTED
          ? { reason: user.rejectionReason, rejectedAt: user.rejectedAt }
          : null,
    };
  }

  async resubmitRegistration(
    userId: string,
    dto: UpdateRegistrationDto,
    options: { identityPepper: string; encryptionKey: string },
  ): Promise<{
    userId: string;
    userStatus: UserStatus;
    bankAccountStatus: UserBankAccountStatus;
    registrationStatus: 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'COMPLETED';
  }> {
    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(UserEntity);
      const bankAccountRepository = manager.getRepository(UserBankAccountEntity);
      const user = await userRepository.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw UserApprovalDomainException.notFound();
      }
      if (user.status !== UserStatus.PENDING && user.status !== UserStatus.REJECTED) {
        throw UserApprovalDomainException.notPending();
      }
      const latestBank = await bankAccountRepository.findOne({
        where: { userId },
        order: { requestedAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!dto.bankAccount) {
        throw UserApprovalDomainException.rejectionReasonRequired();
      }
      const accountNumber = dto.bankAccount.accountNumber.replace(/\D/g, '');
      const bank = bankAccountRepository.create({
        userId,
        bankCode: dto.bankAccount.bankCode,
        accountNumberEncrypted: encryptAccountNumber(
          accountNumber,
          options.encryptionKey,
        ),
        accountNumberHash: hashAccountNumber(accountNumber, options.identityPepper),
        accountNumberMasked: maskAccountNumber(accountNumber),
        holderName: dto.bankAccount.holderName.trim(),
        status: UserBankAccountStatus.PENDING_APPROVAL,
        replacesBankAccountId: latestBank?.id ?? null,
      });
      await bankAccountRepository.save(bank);
      if (user.status === UserStatus.REJECTED) {
        user.status = UserStatus.PENDING;
        user.rejectedAt = null;
        user.rejectionReason = null;
        await userRepository.save(user);
      }
      return {
        userId: user.id,
        userStatus: user.status,
        bankAccountStatus: bank.status,
        registrationStatus: this.getRegistrationViewStatus(user.status, bank.status),
      };
    });
  }

  async approveRegistration(
    adminUserId: string,
    userId: string,
    dto: ApproveUserRegistrationDto,
  ): Promise<{
    userId: string;
    userStatus: UserStatus;
    bankAccountStatus: UserBankAccountStatus;
    registrationStatus: 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'COMPLETED';
    approvedAt: Date;
  }> {
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

      await this.notificationService.enqueueRegistrationPushInTransaction(
        manager,
        {
          eventType: NotificationEventType.USER_REGISTRATION_APPROVED,
          actorUserId: adminUserId,
          referenceType: NotificationReferenceType.USER_APPROVAL_REVIEW,
          referenceId: approvalReview.id,
          deepLink: '/auth/login',
          recipientUserId: userId,
        },
      );

      return {
        userId: user.id,
        userStatus: user.status,
        bankAccountStatus: bankAccount.status,
        registrationStatus: this.getRegistrationViewStatus(
          user.status,
          bankAccount.status,
        ),
        approvedAt: now,
      };
    });
  }

  async rejectRegistration(
    adminUserId: string,
    userId: string,
    dto: RejectUserRegistrationDto,
  ): Promise<{ userId: string; userStatus: UserStatus }> {
    const rejectionReason = dto.reason.trim();
    if (!rejectionReason) {
      throw UserApprovalDomainException.rejectionReasonRequired();
    }
    if (!dto.targets.length) {
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

      const rejectIdentity = dto.targets.includes(RegistrationRejectTarget.IDENTITY);
      const rejectBank = dto.targets.includes(
        RegistrationRejectTarget.BANK_ACCOUNT,
      );

      if (rejectIdentity) {
        user.status = UserStatus.REJECTED;
        user.rejectedAt = now;
        user.rejectionReason = rejectionReason;
        user.approvedAt = null;
        user.approvedByUserId = null;
        await userRepository.save(user);
      }

      const previousStatus = bankAccount.status;
      if (rejectBank) {
        bankAccount.status = UserBankAccountStatus.REJECTED;
        bankAccount.reviewedAt = now;
        bankAccount.reviewedByUserId = adminUserId;
        bankAccount.rejectionReason = rejectionReason;
        await bankAccountRepository.save(bankAccount);
      }

      const bankReview = bankReviewRepository.create({
        bankAccountId: bankAccount.id,
        userId,
        previousStatus,
        decision: BankAccountReviewDecision.REJECTED,
        resultingStatus: rejectBank
          ? UserBankAccountStatus.REJECTED
          : bankAccount.status,
        reviewedByUserId: adminUserId,
        reviewReason: rejectionReason,
        reviewedAt: now,
      });
      await bankReviewRepository.save(bankReview);

      await this.notificationService.enqueueRegistrationPushInTransaction(
        manager,
        {
          eventType: NotificationEventType.USER_REGISTRATION_REJECTED,
          actorUserId: adminUserId,
          referenceType: NotificationReferenceType.USER_APPROVAL_REVIEW,
          referenceId: approvalReview.id,
          deepLink: '/auth/registration-status',
          recipientUserId: userId,
        },
      );

      return { userId: user.id, userStatus: user.status };
    });
  }

  async searchUsers(
    query: SearchAdminUsersDto,
  ): Promise<{ items: AdminUserListItemDto[]; pagination: PaginationMeta }> {
    const page = query.page;
    const size = query.size;
    const qb = this.userRepository
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.profile', 'profile')
      .orderBy('user.registrationSubmittedAt', 'DESC')
      .skip((page - 1) * size)
      .take(size);

    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    const keyword = query.q?.trim();
    if (keyword) {
      const like = `%${keyword}%`;
      qb.andWhere(
        `(user.loginId ILIKE :like
          OR user.phoneE164 ILIKE :like
          OR profile.name ILIKE :like
          OR profile.nickname ILIKE :like)`,
        { like },
      );
    }

    const [users, totalItems] = await qb.getManyAndCount();

    return {
      items: users.map((user) => this.toAdminListItem(user, user.profile)),
      pagination: buildPaginationMeta(page, size, totalItems),
    };
  }

  async getAdminUserDetail(userId: string): Promise<AdminUserDetailDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { profile: true },
    });
    if (!user?.profile) {
      throw UserAdminDomainException.notFound();
    }
    return this.toAdminDetail(user, user.profile);
  }

  async getAdminOpsSnapshot(
    userId: string,
  ): Promise<AdminUserOpsSnapshotDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw UserAdminDomainException.notFound();
    }

    const [wallet, bankAccount, tradeRows, disputeRows, forceCompletedDisputes, activeSessions] =
      await Promise.all([
        this.coinService.findWallet(userId),
        this.findLatestBankAccount(userId),
        this.dataSource
          .getRepository(TradeEntity)
          .createQueryBuilder('trade')
          .select('trade.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .addSelect('COALESCE(SUM(trade.paymentAmount), 0)', 'paymentSum')
          .where(
            'trade.buyer_user_id = :userId OR trade.seller_user_id = :userId',
            { userId },
          )
          .groupBy('trade.status')
          .getRawMany<{
            status: TradeStatus;
            count: string;
            paymentSum: string;
          }>(),
        this.dataSource
          .getRepository(TradeDisputeEntity)
          .createQueryBuilder('dispute')
          .innerJoin('dispute.trade', 'trade')
          .select('dispute.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .where(
            'trade.buyer_user_id = :userId OR trade.seller_user_id = :userId',
            { userId },
          )
          .groupBy('dispute.status')
          .getRawMany<{ status: TradeDisputeStatus; count: string }>(),
        // Inspector 강제 처리: resolution=FORCE_COMPLETE 건수 (status 집계와 별도)
        this.dataSource
          .getRepository(TradeDisputeEntity)
          .createQueryBuilder('dispute')
          .innerJoin('dispute.trade', 'trade')
          .where(
            'trade.buyer_user_id = :userId OR trade.seller_user_id = :userId',
            { userId },
          )
          .andWhere('dispute.resolution = :resolution', {
            resolution: TradeDisputeResolution.FORCE_COMPLETE,
          })
          .getCount(),
        this.authService.countActiveSessions(userId),
      ]);

    const walletDto = wallet
      ? CoinWalletResponseDto.from(wallet)
      : {
          totalBalance: '0',
          availableBalance: '0',
          sellableBalance: '0',
          lockedBalance: '0',
        };

    const tradeSummary = summarizeAdminTradeRows(tradeRows);
    const disputeSummary = summarizeAdminDisputeRows(disputeRows);

    const bank = bankAccount
      ? await this.dataSource.getRepository(BankEntity).findOne({
          where: { code: bankAccount.bankCode },
        })
      : null;

    const recentActivities = user.lastLoginAt
      ? [
          {
            at: user.lastLoginAt,
            type: 'login',
            label: '로그인',
          },
        ]
      : [];

    return {
      userId,
      bankStatus:
        bankAccount?.status ??
        (user.status === UserStatus.PENDING
          ? UserBankAccountStatus.PENDING_APPROVAL
          : user.status === UserStatus.REJECTED
            ? UserBankAccountStatus.REJECTED
            : user.status === UserStatus.SUSPENDED
              ? UserBankAccountStatus.SUSPENDED
              : user.status === UserStatus.WITHDRAWN
                ? UserBankAccountStatus.CLOSED
                : UserBankAccountStatus.ACTIVE),
      walletStatus: mapWalletStatus(user.status, wallet?.status ?? null),
      totalCoin: walletDto.totalBalance,
      availableCoin: walletDto.availableBalance,
      sellableCoin: walletDto.sellableBalance,
      lockedCoin: walletDto.lockedBalance,
      ongoingTrades: tradeSummary.ongoingTrades,
      ongoingTradeAmount:
        tradeSummary.ongoingTrades > 0
          ? tradeSummary.ongoingPayment.toString()
          : null,
      lifetimeTrades: tradeSummary.lifetimeTrades,
      completedTrades: tradeSummary.completedTrades,
      cancelledTrades: tradeSummary.cancelledTrades,
      forceCompletedDisputes,
      ongoingDisputes: disputeSummary.ongoingDisputes,
      lifetimeDisputes: disputeSummary.lifetimeDisputes,
      activeSessions,
      needsPinUnlock: false,
      bankName: bank?.name ?? null,
      accountNumberMasked: bankAccount?.accountNumberMasked ?? null,
      recentActivities,
    };
  }

  private async findLatestBankAccount(
    userId: string,
  ): Promise<UserBankAccountEntity | null> {
    const active = await this.bankAccountRepository.findOne({
      where: { userId, status: UserBankAccountStatus.ACTIVE },
      order: { activatedAt: 'DESC' },
    });
    if (active) return active;
    return this.bankAccountRepository.findOne({
      where: { userId },
      order: { requestedAt: 'DESC' },
    });
  }

  async suspendUser(
    adminUserId: string,
    userId: string,
    reason: string,
  ): Promise<{ id: string; status: UserStatus }> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw UserAdminDomainException.reasonRequired();
    }
    if (adminUserId === userId) {
      throw UserAdminDomainException.cannotModifySelf();
    }

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(UserEntity);
      const user = await userRepository.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw UserAdminDomainException.notFound();
      }
      if (user.status !== UserStatus.ACTIVE) {
        throw UserAdminDomainException.invalidStatusTransition();
      }

      const now = new Date();
      user.status = UserStatus.SUSPENDED;
      user.suspendedAt = now;
      user.suspensionReason = trimmedReason;
      user.suspendedByUserId = adminUserId;
      await userRepository.save(user);

      await this.authService.revokeAllActiveSessionsInTransaction(
        manager,
        userId,
        'USER_SUSPENDED',
      );

      return { id: user.id, status: user.status };
    });
  }

  async unsuspendUser(
    adminUserId: string,
    userId: string,
  ): Promise<void> {
    if (adminUserId === userId) {
      throw UserAdminDomainException.cannotModifySelf();
    }

    await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(UserEntity);
      const user = await userRepository.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw UserAdminDomainException.notFound();
      }
      if (user.status !== UserStatus.SUSPENDED) {
        throw UserAdminDomainException.invalidStatusTransition();
      }
      if (!user.approvedAt || !user.approvedByUserId) {
        throw UserAdminDomainException.invalidStatusTransition();
      }

      user.status = UserStatus.ACTIVE;
      user.suspendedAt = null;
      user.suspensionReason = null;
      user.suspendedByUserId = null;
      await userRepository.save(user);
    });
  }

  async withdrawUser(
    adminUserId: string,
    userId: string,
    reason: string,
  ): Promise<{ id: string; status: UserStatus }> {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw UserAdminDomainException.reasonRequired();
    }
    if (adminUserId === userId) {
      throw UserAdminDomainException.cannotModifySelf();
    }

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(UserEntity);
      const user = await userRepository.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw UserAdminDomainException.notFound();
      }
      if (
        user.status !== UserStatus.ACTIVE &&
        user.status !== UserStatus.SUSPENDED
      ) {
        throw UserAdminDomainException.invalidStatusTransition();
      }

      const now = new Date();
      user.status = UserStatus.WITHDRAWN;
      user.withdrawnAt = now;
      user.withdrawalReason = trimmedReason;
      user.suspendedAt = null;
      user.suspensionReason = null;
      user.suspendedByUserId = null;
      await userRepository.save(user);

      await this.authService.revokeAllActiveSessionsInTransaction(
        manager,
        userId,
        'USER_WITHDRAWN',
      );

      return { id: user.id, status: user.status };
    });
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLoginAt: new Date() });
  }

  private toAdminListItem(
    user: UserEntity,
    profile: UserProfileEntity,
  ): AdminUserListItemDto {
    return {
      id: user.id,
      loginId: user.loginId,
      phoneE164: user.phoneE164,
      status: user.status,
      registrationSubmittedAt: user.registrationSubmittedAt,
      lastLoginAt: user.lastLoginAt,
      name: profile.name,
      nickname: profile.nickname,
    };
  }

  private toAdminDetail(
    user: UserEntity,
    profile: UserProfileEntity,
  ): AdminUserDetailDto {
    return {
      ...this.toAdminListItem(user, profile),
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
      suspendedAt: user.suspendedAt,
      suspensionReason: user.suspensionReason,
      suspendedByUserId: user.suspendedByUserId,
      withdrawnAt: user.withdrawnAt,
      withdrawalReason: user.withdrawalReason,
    };
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

  private getRegistrationViewStatus(
    userStatus: UserStatus,
    bankStatus: UserBankAccountStatus | null,
  ): 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'COMPLETED' {
    if (
      userStatus === UserStatus.ACTIVE &&
      bankStatus === UserBankAccountStatus.ACTIVE
    ) {
      return 'COMPLETED';
    }
    if (
      userStatus === UserStatus.REJECTED ||
      bankStatus === UserBankAccountStatus.REJECTED
    ) {
      return 'ACTION_REQUIRED';
    }
    return 'UNDER_REVIEW';
  }

  private getNextAction(
    userStatus: UserStatus,
    bankStatus: UserBankAccountStatus | null,
  ): 'NONE' | 'WAIT_FOR_APPROVAL' | 'ACTION_REQUIRED' {
    const registrationStatus = this.getRegistrationViewStatus(
      userStatus,
      bankStatus,
    );
    if (registrationStatus === 'COMPLETED') {
      return 'NONE';
    }
    if (registrationStatus === 'ACTION_REQUIRED') {
      return 'ACTION_REQUIRED';
    }
    return 'WAIT_FOR_APPROVAL';
  }
}

function maskResidentRegistrationNumber(rrn: string): string {
  const digits = rrn.replace(/\D/g, '');
  if (digits.length < 6) {
    return '*******';
  }
  return `${digits.slice(0, 6)}*******`;
}

function mapWalletStatus(
  userStatus: UserStatus,
  walletStatus: CoinWalletStatus | null,
): AdminWalletStatusView {
  if (
    userStatus === UserStatus.SUSPENDED ||
    walletStatus === CoinWalletStatus.SUSPENDED ||
    walletStatus === CoinWalletStatus.CLOSED
  ) {
    return AdminWalletStatusView.LOCKED;
  }
  if (
    userStatus === UserStatus.PENDING ||
    userStatus === UserStatus.REJECTED
  ) {
    return AdminWalletStatusView.RESTRICTED;
  }
  return AdminWalletStatusView.NORMAL;
}
