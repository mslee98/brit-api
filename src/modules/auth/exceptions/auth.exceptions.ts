import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

/**
 * Auth 도메인 예외 팩토리.
 * Nest HTTP 예외 + { code, message } 본문.
 * 프론트는 code로 분기한다 (예: PENDING_APPROVAL, LOGIN_ID_TAKEN).
 */
export class AuthDomainException {
  static invalidLoginId(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_LOGIN_ID',
      message: '아이디 형식이 올바르지 않아요.',
    });
  }

  static invalidNickname(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_NICKNAME',
      message: '닉네임 형식이 올바르지 않아요.',
    });
  }

  static invalidPhone(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_PHONE',
      message: '휴대폰 번호 형식이 올바르지 않아요.',
    });
  }

  static invalidRrn(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_RRN',
      message: '주민등록번호 형식이 올바르지 않아요.',
    });
  }

  static invalidPin(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_PIN',
      message: '거래 PIN은 6자리 숫자여야 해요.',
    });
  }

  static consentRequired(): BadRequestException {
    return new BadRequestException({
      code: 'CONSENT_REQUIRED',
      message: '필수 약관에 동의해 주세요.',
    });
  }

  static duplicateConsent(): BadRequestException {
    return new BadRequestException({
      code: 'DUPLICATE_CONSENT',
      message: '동일한 동의 항목이 중복됐어요.',
    });
  }

  static invalidBankCode(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_BANK_CODE',
      message: '선택할 수 없는 은행이에요.',
    });
  }

  static invalidAccountNumber(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_ACCOUNT_NUMBER',
      message: '계좌번호 형식이 올바르지 않아요.',
    });
  }

  static nameMismatch(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'NAME_MISMATCH',
      message: '예금주명이 본인 이름과 일치하지 않아요.',
    });
  }

  static accountNumberTaken(): ConflictException {
    return new ConflictException({
      code: 'ACCOUNT_NUMBER_TAKEN',
      message: '이미 등록된 계좌번호예요.',
    });
  }

  static pendingApproval(): ForbiddenException {
    return new ForbiddenException({
      code: 'PENDING_APPROVAL',
      message: '가입 승인 대기 중이에요. 승인 후 로그인해 주세요.',
    });
  }

  static accountSuspended(): ForbiddenException {
    return new ForbiddenException({
      code: 'ACCOUNT_SUSPENDED',
      message: '이용이 정지된 계정이에요.',
    });
  }

  static accountRejected(): ForbiddenException {
    return new ForbiddenException({
      code: 'ACCOUNT_REJECTED',
      message: '가입이 반려된 계정이에요.',
    });
  }

  static accountWithdrawn(): ForbiddenException {
    return new ForbiddenException({
      code: 'ACCOUNT_WITHDRAWN',
      message: '탈퇴한 계정이에요.',
    });
  }

  static loginIdTaken(): ConflictException {
    return new ConflictException({
      code: 'LOGIN_ID_ALREADY_EXISTS',
      message: '이미 쓰는 아이디예요.',
    });
  }

  static nicknameTaken(): ConflictException {
    return new ConflictException({
      code: 'NICKNAME_ALREADY_EXISTS',
      message: '이미 쓰는 닉네임이에요.',
    });
  }

  static phoneExists(): ConflictException {
    return new ConflictException({
      code: 'PHONE_ALREADY_EXISTS',
      message: '이미 가입된 휴대폰 번호예요.',
    });
  }

  static identityExists(): ConflictException {
    return new ConflictException({
      code: 'RESIDENT_NUMBER_ALREADY_EXISTS',
      message: '이미 가입된 본인 정보예요.',
    });
  }

  static invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: '아이디 또는 비밀번호가 올바르지 않아요.',
    });
  }

  static invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: '세션이 만료됐어요. 다시 로그인해 주세요.',
    });
  }

  static refreshTokenReuse(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'REFRESH_TOKEN_REUSE',
      message: '세션이 만료됐어요. 다시 로그인해 주세요.',
    });
  }

  static adminLoginRequired(): ForbiddenException {
    return new ForbiddenException({
      code: 'ADMIN_LOGIN_REQUIRED',
      message: '관리자 전용 로그인 화면을 이용해 주세요.',
    });
  }
}
