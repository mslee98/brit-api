import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';

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
      message: '주민등록번호 앞자리가 올바르지 않아요.',
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

  static accountVerifyFailed(): BadRequestException {
    return new BadRequestException({
      code: 'ACCOUNT_VERIFY_FAILED',
      message: '계좌를 확인할 수 없어요.',
    });
  }

  static nameMismatch(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'NAME_MISMATCH',
      message: '예금주명이 본인 이름과 일치하지 않아요.',
    });
  }

  static accountVerifyExpired(): UnprocessableEntityException {
    return new UnprocessableEntityException({
      code: 'ACCOUNT_VERIFY_EXPIRED',
      message: '계좌 인증이 만료됐어요. 다시 확인해 주세요.',
    });
  }

  static octomoInvalid(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'OCTOMO_INVALID',
      message: '본인인증을 확인할 수 없어요.',
    });
  }

  static octomoExpired(): ForbiddenException {
    return new ForbiddenException({
      code: 'OCTOMO_EXPIRED',
      message: '본인인증이 만료됐어요. 다시 인증해 주세요.',
    });
  }

  static loginIdTaken(): ConflictException {
    return new ConflictException({
      code: 'LOGIN_ID_TAKEN',
      message: '이미 쓰는 아이디예요.',
    });
  }

  static nicknameTaken(): ConflictException {
    return new ConflictException({
      code: 'NICKNAME_TAKEN',
      message: '이미 쓰는 닉네임이에요.',
    });
  }

  static phoneExists(): ConflictException {
    return new ConflictException({
      code: 'PHONE_EXISTS',
      message: '이미 가입된 휴대폰 번호예요.',
    });
  }

  static identityExists(): ConflictException {
    return new ConflictException({
      code: 'IDENTITY_EXISTS',
      message: '이미 가입된 본인 정보예요.',
    });
  }

  static invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: '아이디 또는 비밀번호가 올바르지 않아요.',
    });
  }

  static invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: '세션이 만료됐어요. 다시 로그인해 주세요.',
    });
  }
}
