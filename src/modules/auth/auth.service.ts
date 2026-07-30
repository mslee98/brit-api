import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

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
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { CheckLoginIdDto } from './dto/check-login-id.dto';
import { CheckNicknameDto } from './dto/check-nickname.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  assertRequiredConsentsAgreed,
  hasDuplicateConsentKeys,
  SignupDto,
} from './dto/signup';
import { AuthDomainException } from './exceptions/auth.exceptions';
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
};

export type SignupResponse = {
  id: string;
  loginId: string;
  status: UserStatus;
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

  /**
   * 회원가입. 성공 시 { id, loginId, status: PENDING }. 토큰 없음.
   * RRN → birthDate/genderCode 파생 후 UserService.createUserInTransaction 호출.
   * 계좌는 PENDING_APPROVAL로만 저장하며, 외부 계좌인증은 수행하지 않는다.
   * 동일 TX에서 관리자용 USER_REGISTRATION_REQUESTED 알림을 생성한다.
   */
  async signup(dto: SignupDto): Promise<SignupResponse> {
    if (hasDuplicateConsentKeys(dto.consents.items)) {
      throw AuthDomainException.duplicateConsent();
    }
    if (!assertRequiredConsentsAgreed(dto.consents.items)) {
      throw AuthDomainException.consentRequired();
    }

    let phoneE164: string;
    try {
      phoneE164 = toPhoneE164(dto.identity.phone);
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
        dto.identity.residentRegistrationNumber,
      ));
    } catch {
      throw AuthDomainException.invalidRrn();
    }

    const loginId = dto.credentials.loginId.toLowerCase();
    if (RESERVED_LOGIN_IDS.has(loginId)) {
      throw AuthDomainException.invalidLoginId();
    }

    const identityName = dto.identity.name.trim();
    const accountHolderName = dto.bankAccount.accountHolderName.trim();
    const nickname = dto.credentials.nickname?.trim() || null;

    if (accountHolderName !== identityName) {
      throw AuthDomainException.nameMismatch();
    }

    const bank = await this.banksService.findActiveByCode(
      dto.bankAccount.bankCode,
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

    const accountNumber = dto.bankAccount.accountNumber.replace(/\D/g, '');
    if (accountNumber.length < 10) {
      throw AuthDomainException.invalidAccountNumber();
    }

    const accountNumberHash = hashAccountNumber(accountNumber, identityPepper);

    const [passwordHash, pinHash, accountNumberEncrypted] = await Promise.all([
      hashSecret(dto.credentials.loginPassword),
      hashTransactionPin(dto.security.pin, pinPepper),
      Promise.resolve(encryptAccountNumber(accountNumber, encryptionKey)),
    ]);

    const agreedAt = new Date(dto.consents.agreedAt);
    const consents = dto.consents.items.map((item) => ({
      consentType: item.consentType,
      documentVersion: item.documentVersion,
      isAgreed: item.isAgreed,
      agreedAt: item.isAgreed ? agreedAt : null,
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
          mobileCarrier: dto.identity.mobileCarrier,
          nickname,
          pinHash,
          bankCode: dto.bankAccount.bankCode,
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
      id: user.id,
      loginId: user.loginId,
      status: user.status,
    };
  }

  /**
   * 로그인. ACTIVE만 통과. PENDING/SUSPENDED/REJECTED/WITHDRAWN은 상태별 예외.
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

    const nickname = await this.userService.getNicknameByUserId(user.id);
    const role = await this.userService.getPrimaryRole(user.id);
    const tokens = await this.createSessionTokens(user.id, role);
    await this.userService.touchLastLogin(user.id);

    return {
      user: {
        id: user.id,
        loginId: user.loginId,
        nickname,
        phoneE164: user.phoneE164,
      },
      tokens,
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  }> {
    const refreshTokenHash = hashRefreshToken(dto.refreshToken);
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

    const user = await this.userService.findById(session.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw AuthDomainException.invalidRefreshToken();
    }

    const newRefreshToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRefreshToken);
    const refreshExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_SEC'),
    );
    const accessExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_SEC'),
    );

    session.refreshTokenHash = newHash;
    session.expiresAt = new Date(Date.now() + refreshExpiresSec * 1000);
    session.lastUsedAt = new Date();
    await this.sessionRepository.save(session);

    const accessToken = await this.signAccessToken(
      session.userId,
      session.id,
      await this.userService.getPrimaryRole(session.userId),
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresInSec: accessExpiresSec,
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

  private assertLoginAllowed(status: UserStatus): void {
    switch (status) {
      case UserStatus.ACTIVE:
        return;
      case UserStatus.PENDING:
        throw AuthDomainException.pendingApproval();
      case UserStatus.SUSPENDED:
        throw AuthDomainException.accountSuspended();
      case UserStatus.REJECTED:
        throw AuthDomainException.accountRejected();
      case UserStatus.WITHDRAWN:
        throw AuthDomainException.accountWithdrawn();
      default:
        throw AuthDomainException.invalidCredentials();
    }
  }

  private async createSessionTokens(
    userId: string,
    role: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  }> {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const refreshExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_SEC'),
    );
    const accessExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_SEC'),
    );

    const session = this.sessionRepository.create({
      userId,
      refreshTokenHash,
      deviceId: null,
      deviceName: null,
      userAgent: null,
      ipAddress: null,
      status: UserSessionStatus.ACTIVE,
      expiresAt: new Date(Date.now() + refreshExpiresSec * 1000),
      lastUsedAt: new Date(),
      revokedAt: null,
      revokeReason: null,
    });
    await this.sessionRepository.save(session);

    const accessToken = await this.signAccessToken(userId, session.id, role);
    return {
      accessToken,
      refreshToken,
      expiresInSec: accessExpiresSec,
    };
  }

  private async signAccessToken(
    userId: string,
    sessionId: string,
    role: string,
  ): Promise<string> {
    const accessExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_SEC'),
    );
    return this.jwtService.signAsync(
      {
        sub: userId,
        sid: sessionId,
        role,
        tokenType: 'access',
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresSec,
      },
    );
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
