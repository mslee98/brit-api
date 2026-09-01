import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class UserAdminDomainException {
  static notFound(): NotFoundException {
    return new NotFoundException({
      code: 'USER_NOT_FOUND',
      message: '사용자를 찾을 수 없어요.',
    });
  }

  static cannotModifySelf(): ForbiddenException {
    return new ForbiddenException({
      code: 'CANNOT_MODIFY_SELF',
      message: '본인 계정은 이 작업으로 변경할 수 없어요.',
    });
  }

  static invalidStatusTransition(): ConflictException {
    return new ConflictException({
      code: 'INVALID_STATUS_TRANSITION',
      message: '현재 상태에서는 요청한 작업을 할 수 없어요.',
    });
  }

  static reasonRequired(): BadRequestException {
    return new BadRequestException({
      code: 'REASON_REQUIRED',
      message: '사유를 입력해 주세요.',
    });
  }

  static userNotActive(): ConflictException {
    return new ConflictException({
      code: 'USER_NOT_ACTIVE',
      message: 'ACTIVE 사용자만 P2P 주문에 참여할 수 있어요.',
    });
  }

  static activeBankAccountRequired(): ConflictException {
    return new ConflictException({
      code: 'ACTIVE_BANK_ACCOUNT_REQUIRED',
      message: 'ACTIVE 계좌가 있어야 P2P 주문에 참여할 수 있어요.',
    });
  }

  static adminP2pNotAllowed(): ForbiddenException {
    return new ForbiddenException({
      code: 'ADMIN_P2P_NOT_ALLOWED',
      message: '관리자 계정은 P2P 거래에 참여할 수 없어요.',
    });
  }
}
