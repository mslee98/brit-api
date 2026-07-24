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
import { hashIdentityKey } from '../../common/utils/identity-key.util';
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
import { parseRrnFront7 } from '../../common/utils/rrn.util';
import { BanksService } from '../banks/banks.service';
import { UserStatus } from '../users/domain/enums/user-status.enum';
import { UserService } from '../users/user.service';
import { AccountVerifyTokenService } from './account-verify-token.service';
import { CheckLoginIdDto } from './dto/check-login-id.dto';
import { CheckNicknameDto } from './dto/check-nickname.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { AuthDomainException } from './exceptions/auth.exceptions';
import { UserSessionStatus } from './domain/enums/user-session-status.enum';
import { UserSessionEntity } from './infrastructure/entities/user-session.entity';
import { OctomoService } from './octomo.service';

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
  success: true;
  user: {
    id: string;
    loginId: string;
    nickname: string;
    phoneE164: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly banksService: BanksService,
    private readonly accountVerifyTokenService: AccountVerifyTokenService,
    private readonly octomoService: OctomoService,
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

    // P0: 실계좌 API 미연동 — 입력 이름을 예금주로 신뢰(토큰으로 signup 위조 방지)
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

  async signup(dto: SignupDto): Promise<AuthTokensResponse> {
    if (
      !dto.consents.service ||
      !dto.consents.privacy ||
      !dto.consents.identity
    ) {
      throw AuthDomainException.consentRequired();
    }

    let phoneE164: string;
    try {
      phoneE164 = toPhoneE164(dto.identity.phone);
    } catch {
      throw AuthDomainException.invalidPhone();
    }

    let birthDate: string;
    let genderCode: ReturnType<typeof parseRrnFront7>['genderCode'];
    try {
      ({ birthDate, genderCode } = parseRrnFront7(dto.identity.rrnFront7));
    } catch {
      throw AuthDomainException.invalidRrn();
    }

    const loginId = dto.credentials.loginId.toLowerCase();
    if (RESERVED_LOGIN_IDS.has(loginId)) {
      throw AuthDomainException.invalidLoginId();
    }

    const phoneDigits = dto.identity.phone.replace(/\D/g, '');
    const octomoVerifiedAt = new Date(dto.octomo.verifiedAt);
    try {
      await this.octomoService.assertMessageExists({
        phoneDigits,
        verifiedAt: octomoVerifiedAt,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'OCTOMO_EXPIRED') {
        throw AuthDomainException.octomoExpired();
      }
      throw AuthDomainException.octomoInvalid();
    }

    const identityPepper =
      this.configService.getOrThrow<string>('IDENTITY_PEPPER');
    const accountNumber = dto.bankAccount.accountNumber.replace(/\D/g, '');
    const accountNumberHash = hashAccountNumber(accountNumber, identityPepper);

    let verifyPayload;
    try {
      verifyPayload = await this.accountVerifyTokenService.verify(
        dto.bankAccount.accountVerifyToken,
      );
    } catch {
      throw AuthDomainException.accountVerifyExpired();
    }

    if (
      verifyPayload.bankCode !== dto.bankAccount.bankCode ||
      verifyPayload.accountNumberHash !== accountNumberHash ||
      verifyPayload.holderName !== dto.bankAccount.accountHolderName ||
      verifyPayload.name !== dto.identity.name.trim()
    ) {
      throw AuthDomainException.accountVerifyExpired();
    }

    if (dto.bankAccount.accountHolderName.trim() !== dto.identity.name.trim()) {
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

    const [
      passwordHash,
      transactionPinHash,
      accountNumberEncrypted,
      identityKeyHash,
    ] = await Promise.all([
      hashSecret(dto.credentials.loginPassword),
      hashTransactionPin(dto.security.transactionPin, pinPepper),
      Promise.resolve(encryptAccountNumber(accountNumber, encryptionKey)),
      Promise.resolve(
        hashIdentityKey({
          pepper: identityPepper,
          name: dto.identity.name.trim(),
          birthDate,
          genderCode,
        }),
      ),
    ]);

    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const accessExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_SEC'),
    );
    const refreshExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_REFRESH_EXPIRES_SEC'),
    );
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresSec * 1000);
    const now = new Date();

    let userId: string;
    try {
      userId = await this.dataSource.transaction(async (manager) => {
        const user = await this.userService.createUserInTransaction(manager, {
          loginId,
          passwordHash,
          phoneE164,
          name: dto.identity.name.trim(),
          birthDate,
          genderCode,
          mobileCarrier: dto.identity.mobileCarrier,
          nickname: dto.credentials.nickname.trim(),
          identityKeyHash,
          octomoRequestId: dto.octomo.requestId,
          phoneVerifiedAt: octomoVerifiedAt,
          identityVerifiedAt: octomoVerifiedAt,
          transactionPinHash,
          bankCode: dto.bankAccount.bankCode,
          accountNumberEncrypted,
          accountNumberHash,
          accountNumberMasked: maskAccountNumber(accountNumber),
          holderName: dto.bankAccount.accountHolderName.trim(),
          bankAccountVerifiedAt: now,
          consents: {
            service: dto.consents.service,
            privacy: dto.consents.privacy,
            identity: dto.consents.identity,
            marketing: dto.consents.marketing,
            agreedAt: new Date(dto.consents.agreedAt),
          },
        });

        const sessionRepository = manager.getRepository(UserSessionEntity);
        const session = sessionRepository.create({
          userId: user.id,
          refreshTokenHash,
          deviceId: null,
          deviceName: null,
          userAgent: null,
          ipAddress: null,
          status: UserSessionStatus.ACTIVE,
          expiresAt: refreshExpiresAt,
          lastUsedAt: now,
          revokedAt: null,
        });
        await sessionRepository.save(session);

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
    const nickname = await this.userService.getNicknameByUserId(userId);
    const session = await this.sessionRepository.findOne({
      where: { refreshTokenHash, status: UserSessionStatus.ACTIVE },
    });
    if (!session || !nickname) {
      throw AuthDomainException.invalidCredentials();
    }

    const accessToken = await this.signAccessToken(user.id, session.id);

    return {
      success: true,
      user: {
        id: user.id,
        loginId: user.loginId,
        nickname,
        phoneE164: user.phoneE164,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresInSec: accessExpiresSec,
      },
    };
  }

  async login(dto: LoginDto): Promise<AuthTokensResponse> {
    const user = await this.userService.findByLoginId(dto.loginId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw AuthDomainException.invalidCredentials();
    }

    const matched = await verifySecret(dto.password, user.passwordHash);
    if (!matched) {
      throw AuthDomainException.invalidCredentials();
    }

    const nickname = await this.userService.getNicknameByUserId(user.id);
    if (!nickname) {
      throw AuthDomainException.invalidCredentials();
    }

    const tokens = await this.createSessionTokens(user.id);
    await this.userService.touchLastLogin(user.id);

    return {
      success: true,
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
      },
    );
  }

  private async createSessionTokens(userId: string): Promise<{
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
    });
    await this.sessionRepository.save(session);

    const accessToken = await this.signAccessToken(userId, session.id);
    return {
      accessToken,
      refreshToken,
      expiresInSec: accessExpiresSec,
    };
  }

  private async signAccessToken(
    userId: string,
    sessionId: string,
  ): Promise<string> {
    const accessExpiresSec = Number(
      this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_SEC'),
    );
    return this.jwtService.signAsync(
      {
        sub: userId,
        sid: sessionId,
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
    const driverError = error.driverError as { code?: string; constraint?: string };
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
    if (
      constraint.includes('identity_key_hash') ||
      constraint.includes('octomo_request_id') ||
      constraint.includes('request_id')
    ) {
      throw AuthDomainException.identityExists();
    }
    if (constraint.includes('account_number_hash')) {
      throw AuthDomainException.accountVerifyFailed();
    }
  }
}
