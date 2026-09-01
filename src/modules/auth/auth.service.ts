import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';

import {
  encryptAccountNumber,
  hashAccountNumber,
  maskAccountNumber,
} from '../../common/utils/account-crypto.util';
import {
  hashSecret,
  hashTransactionPin,
  verifySecret,
} from '../../common/utils/password.util';
import { toPhoneE164 } from '../../common/utils/phone-e164.util';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../../common/utils/refresh-token.util';
import { parseResidentRegistrationNumber } from '../users/utils/rrn.util';
import { BanksService } from '../banks/banks.service';
import { NotificationService } from '../notifications/notification.service';
import { UserBankAccountStatus } from '../users/domain/enums/user-bank-account-status.enum';
import { ConsentType } from '../users/domain/enums/consent-type.enum';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { CheckLoginIdDto } from './dto/check-login-id.dto';
import { CheckNicknameDto } from './dto/check-nickname.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { AuthDomainException } from './exceptions/auth.exceptions';
import { AuthClientType } from './domain/enums/auth-client-type.enum';
import { UserSessionStatus } from './domain/enums/user-session-status.enum';
import { UserSessionEntity } from './infrastructure/entities/user-session.entity';

const RESERVED_LOGIN_IDS = new Set([
  'admin',
  'root',
  'system',
  'brit',
  'support',
  'null',
  'undefined',
]);

export type AuthTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  sessionId: string;
};

export type CreateSessionTokensOptions = {
  clientType: AuthClientType;
  accessExpiresSec?: number;
  refreshExpiresSec?: number;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type RotateSessionTokensOptions = {
  clientType: AuthClientType;
  role: UserRole | string;
  status: UserStatus;
  accessExpiresSec?: number;
  refreshExpiresSec?: number;
};

export type AuthTokensResponse = {
  user: {
    id: string;
    loginId: string;
    nickname: string | null;
    phoneE164: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  };
  nextAction: 'NONE' | 'WAIT_FOR_APPROVAL' | 'ACTION_REQUIRED';
};

export type RegisterResponse = {
  userId: string;
  status: UserStatus;
  nextAction: 'WAIT_FOR_APPROVAL';
};

/**
 * 인증·가입 유스케이스.
 *
 * 가입 정책 (ERD v3):
 * 1) POST /auth/signup → 정보 제출, PENDING 사용자·계좌·지갑 생성 (토큰 미발급)
 * 2) 관리자가 신원·전화·계좌를 수동 확인 후 ACTIVE
 * 3) POST /auth/login → ACTIVE만 허용, 세션+JWT 발급
 *
 * 외부 본인인증·계좌 인증 API는 가입 경로에 두지 않는다.
 * 관련: UserService, users/utils/rrn.util, account-crypto.util
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly banksService: BanksService,
    private readonly notificationService: NotificationService,
    @InjectRepository(UserSessionEntity)
    private readonly sessionRepository: Repository<UserSessionEntity>,
  ) {}

  async checkLoginId(dto: CheckLoginIdDto): Promise<{ available: boolean }> {
    const loginId = dto.loginId.toLowerCase();
    if (RESERVED_LOGIN_IDS.has(loginId)) {
      throw AuthDomainException.invalidLoginId();
    }
    const exists = await this.userService.existsByLoginId(loginId);
    return { available: !exists };
  }

  async checkNickname(
    dto: CheckNicknameDto,
  ): Promise<{ available: boolean }> {
    const nickname = dto.nickname.trim();
    const exists = await this.userService.existsByNickname(nickname);
    return { available: !exists };
  }

  async register(dto: RegisterDto): Promise<RegisterResponse> {
    this.assertRequiredConsents(dto.consents);

    let phoneE164: string;
    try {
      phoneE164 = toPhoneE164(dto.phone);
    } catch {
      throw AuthDomainException.invalidPhone();
    }

    let residentRegistrationNumber: string;
    let birthDate: string;
    let genderCode: ReturnType<
      typeof parseResidentRegistrationNumber
    >['genderCode'];
    try {
      ({
        residentRegistrationNumber,
        birthDate,
        genderCode,
      } = parseResidentRegistrationNumber(
        dto.residentRegistrationNumber,
      ));
    } catch {
      throw AuthDomainException.invalidRrn();
    }

    const loginId = dto.loginId.toLowerCase();
    if (RESERVED_LOGIN_IDS.has(loginId)) {
      throw AuthDomainException.invalidLoginId();
    }

    const identityName = dto.name.trim();
    const accountHolderName = dto.bankAccountHolderName.trim();
    const nickname = dto.nickname?.trim() || null;

    if (accountHolderName !== identityName) {
      throw AuthDomainException.nameMismatch();
    }

    const bank = await this.banksService.findActiveByCode(
      dto.bankCode,
    );
    if (!bank) {
      throw AuthDomainException.invalidBankCode();
    }

    const identityPepper =
      this.configService.getOrThrow<string>('IDENTITY_PEPPER');
    const encryptionKey = this.configService.getOrThrow<string>(
      'ACCOUNT_ENCRYPTION_KEY',
    );
    const pinPepper = this.configService.getOrThrow<string>(
      'TRANSACTION_PIN_PEPPER',
    );

    const accountNumber = dto.bankAccountNumber.replace(/\D/g, '');
    if (accountNumber.length < 10) {
      throw AuthDomainException.invalidAccountNumber();
    }

    const accountNumberHash = hashAccountNumber(accountNumber, identityPepper);

    const [passwordHash, pinHash, accountNumberEncrypted] = await Promise.all([
      hashSecret(dto.password),
      hashTransactionPin(dto.pin, pinPepper),
      Promise.resolve(encryptAccountNumber(accountNumber, encryptionKey)),
    ]);

    const consents = dto.consents.map((item) => ({
      consentType: item.type,
      documentVersion: item.version,
      isAgreed: item.agreed,
      agreedAt: item.agreed ? new Date() : null,
    }));

    let userId: string;
    try {
      userId = await this.dataSource.transaction(async (manager) => {
        const user = await this.userService.createUserInTransaction(manager, {
          loginId,
          passwordHash,
          phoneE164,
          name: identityName,
          residentRegistrationNumber,
          birthDate,
          genderCode,
          mobileCarrier: dto.mobileCarrier,
          nickname,
          pinHash,
          bankCode: dto.bankCode,
          accountNumberEncrypted,
          accountNumberHash,
          accountNumberMasked: maskAccountNumber(accountNumber),
          holderName: accountHolderName,
          consents,
        });

        const adminUserIds =
          await this.userService.findActiveAdminUserIds(manager);
        await this.notificationService.createRegistrationRequestedInTransaction(
          manager,
          {
            applicantUserId: user.id,
            recipientUserIds: adminUserIds,
          },
        );

        return user.id;
      });
    } catch (error) {
      this.rethrowUniqueViolation(error);
      throw error;
    }

    const user = await this.userService.findById(userId);
    if (!user) {
      throw AuthDomainException.invalidCredentials();
    }

    return {
      userId: user.id,
      status: user.status,
      nextAction: 'WAIT_FOR_APPROVAL',
    };
  }

  /**
   * 로그인. ACTIVE/PENDING/REJECTED 허용, SUSPENDED/WITHDRAWN 차단.
   * ACTIVE ADMIN/SYS_ADMIN은 관리자 전용 로그인으로 유도한다.
   */
  async login(dto: LoginDto): Promise<AuthTokensResponse> {
    const user = await this.userService.findByLoginId(dto.loginId);
    if (!user) {
      throw AuthDomainException.invalidCredentials();
    }

    this.assertLoginAllowed(user.status);

    const matched = await verifySecret(dto.password, user.passwordHash);
    if (!matched) {
      throw AuthDomainException.invalidCredentials();
    }

    if (await this.userService.hasActiveAdminRole(user.id)) {
      throw AuthDomainException.adminLoginRequired();
    }

    const nickname = await this.userService.getNicknameByUserId(user.id);
    const role = await this.userService.getPrimaryRole(user.id);
    const tokens = await this.createSessionTokens(user.id, role, user.status, {
      clientType: AuthClientType.USER,
    });
    await this.userService.touchLastLogin(user.id);

    return {
      user: {
        id: user.id,
        loginId: user.loginId,
        nickname,
        phoneE164: user.phoneE164,
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSec: tokens.expiresInSec,
      },
      nextAction: this.toNextAction(user.status),
    };
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
    return this.userService.getMe(userId);
  }

  async getRegistrationStatus(userId: string): Promise<{
    userStatus: UserStatus;
    bankAccountStatus: UserBankAccountStatus | null;
    registrationStatus: 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'COMPLETED';
    submittedAt: Date;
    rejection: { reason: string | null; rejectedAt: Date | null } | null;
  }> {
    return this.userService.getRegistrationStatus(userId);
  }

  async updateRegistration(
    userId: string,
    dto: UpdateRegistrationDto,
  ): Promise<{
    userId: string;
    userStatus: UserStatus;
    bankAccountStatus: UserBankAccountStatus;
    registrationStatus: 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'COMPLETED';
  }> {
    const identityPepper =
      this.configService.getOrThrow<string>('IDENTITY_PEPPER');
    const encryptionKey = this.configService.getOrThrow<string>(
      'ACCOUNT_ENCRYPTION_KEY',
    );
    return this.userService.resubmitRegistration(userId, dto, {
      identityPepper,
      encryptionKey,
    });
  }

  async refresh(dto: RefreshTokenDto): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  }> {
    const session = await this.resolveActiveSessionForRefresh(dto.refreshToken);
    const user = await this.userService.findById(session.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw AuthDomainException.invalidRefreshToken();
    }

    if (await this.userService.hasActiveAdminRole(user.id)) {
      throw AuthDomainException.adminLoginRequired();
    }

    const role = await this.userService.getPrimaryRole(session.userId);
    const tokens = await this.rotateSessionTokens(session, {
      clientType: AuthClientType.USER,
      role,
      status: user.status,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresInSec: tokens.expiresInSec,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionRepository.update(
      { id: sessionId, status: UserSessionStatus.ACTIVE },
      {
        status: UserSessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason: 'LOGOUT',
      },
    );
  }

  async logoutByRefreshToken(refreshToken: string): Promise<void> {
    const refreshTokenHash = hashRefreshToken(refreshToken);
    await this.sessionRepository.update(
      { refreshTokenHash, status: UserSessionStatus.ACTIVE },
      {
        status: UserSessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason: 'LOGOUT',
      },
    );
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionRepository.update(
      { userId, status: UserSessionStatus.ACTIVE },
      {
        status: UserSessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason: 'LOGOUT_ALL',
      },
    );
  }

  async countActiveSessions(userId: string): Promise<number> {
    return this.sessionRepository.count({
      where: { userId, status: UserSessionStatus.ACTIVE },
    });
  }

  async listSessionsForUser(
    userId: string,
    currentSessionId: string,
  ): Promise<
    Array<{
      id: string;
      userAgent: string | null;
      ipAddress: string | null;
      status: UserSessionStatus;
      createdAt: Date;
      lastUsedAt: Date | null;
      expiresAt: Date;
      current: boolean;
    }>
  > {
    const rows = await this.sessionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      status: row.status,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      current: row.id === currentSessionId,
    }));
  }

  async revokeSessionForUser(
    userId: string,
    sessionId: string,
    revokeReason = 'SESSION_REVOKED',
  ): Promise<void> {
    const result = await this.sessionRepository.update(
      { id: sessionId, userId, status: UserSessionStatus.ACTIVE },
      {
        status: UserSessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason,
      },
    );
    if (!result.affected) {
      throw AuthDomainException.invalidRefreshToken();
    }
  }

  async revokeOtherSessionsForUser(
    userId: string,
    currentSessionId: string,
  ): Promise<void> {
    await this.sessionRepository
      .createQueryBuilder()
      .update(UserSessionEntity)
      .set({
        status: UserSessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason: 'LOGOUT_OTHERS',
      })
      .where('user_id = :userId', { userId })
      .andWhere('status = :status', { status: UserSessionStatus.ACTIVE })
      .andWhere('id <> :currentSessionId', { currentSessionId })
      .execute();
  }

  /**
   * 대상 사용자의 ACTIVE 세션을 모두 REVOKED로 바꾼다.
   * 정지·탈퇴·관리자 권한 변경 트랜잭션에서 EntityManager와 함께 호출한다.
   * @returns 폐기된 ACTIVE 세션 수
   */
  async revokeAllActiveSessionsInTransaction(
    manager: EntityManager,
    userId: string,
    revokeReason: string,
  ): Promise<number> {
    const result = await manager.getRepository(UserSessionEntity).update(
      { userId, status: UserSessionStatus.ACTIVE },
      {
        status: UserSessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason,
      },
    );
    return result.affected ?? 0;
  }

  async revokeAllActiveSessions(
    userId: string,
    revokeReason: string,
  ): Promise<void> {
    await this.sessionRepository.update(
      { userId, status: UserSessionStatus.ACTIVE },
      {
        status: UserSessionStatus.REVOKED,
        revokedAt: new Date(),
        revokeReason,
      },
    );
  }

  /**
   * Refresh 토큰으로 ACTIVE 세션을 찾는다.
   * previous_hash 매칭 시 재사용 공격으로 전체 세션을 폐기한다.
   */
  async resolveActiveSessionForRefresh(
    refreshToken: string,
  ): Promise<UserSessionEntity> {
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const reused = await this.sessionRepository.findOne({
      where: { previousRefreshTokenHash: refreshTokenHash },
    });
    if (reused) {
      await this.revokeAllActiveSessions(
        reused.userId,
        'REFRESH_TOKEN_REUSE',
      );
      throw AuthDomainException.refreshTokenReuse();
    }

    const session = await this.sessionRepository.findOne({
      where: { refreshTokenHash },
    });

    if (
      !session ||
      session.status !== UserSessionStatus.ACTIVE ||
      session.expiresAt.getTime() < Date.now()
    ) {
      throw AuthDomainException.invalidRefreshToken();
    }

    return session;
  }

  async createSessionTokens(
    userId: string,
    role: string,
    status: UserStatus,
    options: CreateSessionTokensOptions,
  ): Promise<AuthTokenPair> {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const refreshExpiresSec =
      options.refreshExpiresSec ??
      Number(this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_SEC'));
    const accessExpiresSec =
      options.accessExpiresSec ??
      Number(this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_SEC'));

    const session = this.sessionRepository.create({
      userId,
      refreshTokenHash,
      previousRefreshTokenHash: null,
      deviceId: null,
      deviceName: null,
      userAgent: options.userAgent ?? null,
      ipAddress: options.ipAddress ?? null,
      status: UserSessionStatus.ACTIVE,
      expiresAt: new Date(Date.now() + refreshExpiresSec * 1000),
      lastUsedAt: new Date(),
      revokedAt: null,
      revokeReason: null,
    });
    await this.sessionRepository.save(session);

    const accessToken = await this.signAccessToken(
      userId,
      session.id,
      role,
      status,
      options.clientType,
      accessExpiresSec,
    );
    return {
      accessToken,
      refreshToken,
      expiresInSec: accessExpiresSec,
      sessionId: session.id,
    };
  }

  async rotateSessionTokens(
    session: UserSessionEntity,
    options: RotateSessionTokensOptions,
  ): Promise<AuthTokenPair> {
    const newRefreshToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRefreshToken);
    const refreshExpiresSec =
      options.refreshExpiresSec ??
      Number(this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_SEC'));
    const accessExpiresSec =
      options.accessExpiresSec ??
      Number(this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_SEC'));

    session.previousRefreshTokenHash = session.refreshTokenHash;
    session.refreshTokenHash = newHash;
    session.expiresAt = new Date(Date.now() + refreshExpiresSec * 1000);
    session.lastUsedAt = new Date();
    await this.sessionRepository.save(session);

    const accessToken = await this.signAccessToken(
      session.userId,
      session.id,
      options.role,
      options.status,
      options.clientType,
      accessExpiresSec,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresInSec: accessExpiresSec,
      sessionId: session.id,
    };
  }

  private assertLoginAllowed(status: UserStatus): void {
    switch (status) {
      case UserStatus.ACTIVE:
      case UserStatus.PENDING:
      case UserStatus.REJECTED:
        return;
      case UserStatus.SUSPENDED:
        throw AuthDomainException.accountSuspended();
      case UserStatus.WITHDRAWN:
        throw AuthDomainException.accountWithdrawn();
      default:
        throw AuthDomainException.invalidCredentials();
    }
  }

  private async signAccessToken(
    userId: string,
    sessionId: string,
    role: string,
    status: UserStatus,
    clientType: AuthClientType,
    accessExpiresSec: number,
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: userId,
        sid: sessionId,
        role,
        roles: [role],
        status,
        tokenType: 'access',
        clientType,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresSec,
      },
    );
  }

  private assertRequiredConsents(consents: RegisterDto['consents']): void {
    const required: ConsentType[] = [
      ConsentType.SERVICE,
      ConsentType.PRIVACY,
      ConsentType.UNIQUE_IDENTIFIER,
      ConsentType.BANK_ACCOUNT,
    ];
    const map = new Map<string, boolean>();
    for (const consent of consents) {
      const key = `${consent.type}:${consent.version}`;
      if (map.has(key)) {
        throw AuthDomainException.duplicateConsent();
      }
      map.set(key, consent.agreed);
    }
    for (const type of required) {
      const agreed = consents.some(
        (consent) => consent.type === type && consent.agreed,
      );
      if (!agreed) {
        throw AuthDomainException.consentRequired();
      }
    }
  }

  private toNextAction(
    status: UserStatus,
  ): 'NONE' | 'WAIT_FOR_APPROVAL' | 'ACTION_REQUIRED' {
    if (status === UserStatus.ACTIVE) {
      return 'NONE';
    }
    if (status === UserStatus.REJECTED) {
      return 'ACTION_REQUIRED';
    }
    return 'WAIT_FOR_APPROVAL';
  }

  private rethrowUniqueViolation(error: unknown): void {
    if (!(error instanceof QueryFailedError)) {
      return;
    }
    const driverError = error.driverError as {
      code?: string;
      constraint?: string;
    };
    if (driverError.code !== '23505') {
      return;
    }
    const constraint = driverError.constraint ?? '';
    if (constraint.includes('login_id')) {
      throw AuthDomainException.loginIdTaken();
    }
    if (constraint.includes('nickname')) {
      throw AuthDomainException.nicknameTaken();
    }
    if (constraint.includes('phone_e164')) {
      throw AuthDomainException.phoneExists();
    }
    if (constraint.includes('resident_registration_number')) {
      throw AuthDomainException.identityExists();
    }
    if (constraint.includes('account_number_hash')) {
      throw AuthDomainException.accountNumberTaken();
    }
  }
}
