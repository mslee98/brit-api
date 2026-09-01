import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * 관리자 인증·계정 도메인 예외.
 */
export class AdminDomainException {
  static invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: '아이디 또는 비밀번호가 올바르지 않아요.',
    });
  }

  static accountNotActive(): ForbiddenException {
    return new ForbiddenException({
      code: 'ACCOUNT_NOT_ACTIVE',
      message: '활성 계정만 관리자 로그인을 할 수 있어요.',
    });
  }

  static adminRoleRequired(): ForbiddenException {
    return new ForbiddenException({
      code: 'ADMIN_ROLE_REQUIRED',
      message: '관리자 권한이 없어요.',
    });
  }

  static adminProfileNotConfigured(): ForbiddenException {
    return new ForbiddenException({
      code: 'ADMIN_PROFILE_NOT_CONFIGURED',
      message: '관리자 프로필이 설정되지 않았어요.',
    });
  }

  static adminProfileInactive(): ForbiddenException {
    return new ForbiddenException({
      code: 'ADMIN_PROFILE_INACTIVE',
      message: '관리자 업무가 중지된 계정이에요.',
    });
  }

  static adminLoginRequired(): ForbiddenException {
    return new ForbiddenException({
      code: 'ADMIN_LOGIN_REQUIRED',
      message: '관리자 전용 로그인 화면을 이용해 주세요.',
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

  static forbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'FORBIDDEN',
      message: '권한이 없어요.',
    });
  }

  static adminNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ADMIN_NOT_FOUND',
      message: '관리자를 찾을 수 없어요.',
    });
  }

  static userNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'USER_NOT_FOUND',
      message: '사용자를 찾을 수 없어요.',
    });
  }

  static alreadyAdmin(): ConflictException {
    return new ConflictException({
      code: 'ALREADY_ADMIN',
      message: '이미 활성 관리자 역할이 있어요.',
    });
  }

  static selfDeactivationNotAllowed(): ConflictException {
    return new ConflictException({
      code: 'SELF_DEACTIVATION_NOT_ALLOWED',
      message: '본인 관리자 권한은 비활성화할 수 없어요.',
    });
  }

  static lastSysAdminRequired(): ConflictException {
    return new ConflictException({
      code: 'LAST_SYS_ADMIN_REQUIRED',
      message: '마지막 SYS_ADMIN은 비활성화하거나 회수할 수 없어요.',
    });
  }

  static insufficientAdminLevel(): ForbiddenException {
    return new ForbiddenException({
      code: 'INSUFFICIENT_ADMIN_LEVEL',
      message: '상위 관리자를 변경할 권한이 없어요.',
    });
  }

  static selfPermissionEscalationNotAllowed(): ForbiddenException {
    return new ForbiddenException({
      code: 'SELF_PERMISSION_ESCALATION_NOT_ALLOWED',
      message: '본인 권한은 스스로 올릴 수 없어요.',
    });
  }

  static userNotActive(): ConflictException {
    return new ConflictException({
      code: 'USER_NOT_ACTIVE',
      message: 'ACTIVE 사용자만 관리자로 등록할 수 있어요.',
    });
  }

  static adminAlreadyActive(): ConflictException {
    return new ConflictException({
      code: 'ADMIN_ALREADY_ACTIVE',
      message: '이미 활성 상태인 관리자예요.',
    });
  }

  static invalidAdminRole(): ConflictException {
    return new ConflictException({
      code: 'INVALID_ADMIN_ROLE',
      message: 'ADMIN 또는 SYS_ADMIN 역할만 부여할 수 있어요.',
    });
  }

  static sessionNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'SESSION_NOT_FOUND',
      message: '세션을 찾을 수 없어요.',
    });
  }

  static auditLogNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'AUDIT_LOG_NOT_FOUND',
      message: '감사 로그를 찾을 수 없어요.',
    });
  }

  static bankNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'BANK_NOT_FOUND',
      message: '은행을 찾을 수 없어요.',
    });
  }

  static duplicateBankCode(): ConflictException {
    return new ConflictException({
      code: 'DUPLICATE_BANK_CODE',
      message: '이미 등록된 은행 코드예요.',
    });
  }

  static bankAlreadyActive(): ConflictException {
    return new ConflictException({
      code: 'BANK_ALREADY_ACTIVE',
      message: '이미 활성 상태인 은행이에요.',
    });
  }

  static bankAlreadyInactive(): ConflictException {
    return new ConflictException({
      code: 'BANK_ALREADY_INACTIVE',
      message: '이미 비활성 상태인 은행이에요.',
    });
  }

  static invalidMaintenanceTime(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_MAINTENANCE_TIME',
      message: '점검 시작·종료 시각은 둘 다 입력하거나 둘 다 비워야 해요.',
    });
  }

  static bankIconRequired(): BadRequestException {
    return new BadRequestException({
      code: 'BANK_ICON_REQUIRED',
      message: '은행을 활성화하려면 아이콘 정보가 필요해요.',
    });
  }

  static adminP2pNotAllowed(): ForbiddenException {
    return new ForbiddenException({
      code: 'ADMIN_P2P_NOT_ALLOWED',
      message: '관리자 계정은 P2P 거래에 참여할 수 없어요.',
    });
  }
}
