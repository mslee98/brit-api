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
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { AccountVerifyTokenService } from './account-verify-token.service';
import { CheckLoginIdDto } from './dto/check-login-id.dto';
import { CheckNicknameDto } from './dto/check-nickname.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  assertRequiredConsentsAgreed,
  hasDuplicateConsentKeys,
  SignupDto,
} from './dto/signup';
import { VerifyAccountDto } from './dto/verify-account.dto';
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
 * 1) POST /auth/accounts/verify → accountVerifyToken 발급 (위조 방지)
 * 2) POST /auth/signup → PENDING 사용자 생성, 토큰 미발급
 * 3) 관리자 승인 후 ACTIVE
 * 4) POST /auth/login → ACTIVE만 허용, 세션+JWT 발급
 *
 * 관련: UserService, AccountVerifyTokenService, users/utils/rrn.util, account-crypto.util
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly banksService: BanksService,
    private readonly accountVerifyTokenService: AccountVerifyTokenService,
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
   * 계좌 확인 토큰 발급.
   * P0: 실계좌 API 미연동 — 입력 이름을 예금주로 신뢰하고 HMAC 해시로 토큰에 묶는다.
   * signup 시 토큰 내용과 bankCode/account/holder/name이 일치해야 한다.
   */
  async verifyAccount(dto: VerifyAccountDto): Promise<{
    verified: true;
    holderName: string;
    bankName: string;
    accountNumberMasked: string;
    accountVerifyToken: string;
    expiresInSec: number;
  }> {
    const bank = await this.banksService.findActiveByCode(dto.bankCode);
    if (!bank) {
      throw AuthDomainException.accountVerifyFailed();
    }

    const accountNumber = dto.accountNumber.replace(/\D/g, '');
    if (accountNumber.length < 10) {
      throw AuthDomainException.accountVerifyFailed();
    }

    const holderName = dto.name.trim();

    const pepper = this.configService.getOrThrow<string>('IDENTITY_PEPPER');
    const accountNumberHash = hashAccountNumber(accountNumber, pepper);
    const issued = await this.accountVerifyTokenService.issue({
      name: holderName,
      bankCode: dto.bankCode,
      accountNumberHash,
      holderName,
    });

    return {
      verified: true,
      holderName,
      bankName: bank.name,
      accountNumberMasked: maskAccountNumber(accountNumber),
      accountVerifyToken: issued.token,
      expiresInSec: issued.expiresInSec,
    };
  }

  /**
   * 회원가입. 성공 시 { id, loginId, status: PENDING }. 토큰 없음.
   * RRN → birthDate/genderCode 파생 후 UserService.createUserInTransaction 호출.
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

    const identityPepper =
      this.configService.getOrThrow<string>('IDENTITY_PEPPER');
    const accountNumber = dto.bankAccount.accountNumber.replace(/\D/g, '');
    const accountNumberHash = hashAccountNumber(accountNumber, identityPepper);

    const verifyPayload = await this.accountVerifyTokenService.verify(
      dto.bankAccount.accountVerifyToken,
    );

    if (
      verifyPayload.bankCode !== dto.bankAccount.bankCode ||
      verifyPayload.accountNumberHash !== accountNumberHash ||
      verifyPayload.holderName !== accountHolderName ||
      verifyPayload.name !== identityName
    ) {
      throw AuthDomainException.accountVerifyExpired();
    }

    if (accountHolderName !== identityName) {
      throw AuthDomainException.nameMismatch();
    }

    const bank = await this.banksService.findActiveByCode(
      dto.bankAccount.bankCode,
    );
    if (!bank) {
      throw AuthDomainException.accountVerifyFailed();
    }

    const encryptionKey = this.configService.getOrThrow<string>(
      'ACCOUNT_ENCRYPTION_KEY',
    );
    const pinPepper = this.configService.getOrThrow<string>(
      'TRANSACTION_PIN_PEPPER',
    );

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
      throw AuthDomainException.accountVerifyFailed();
    }
  }
}
