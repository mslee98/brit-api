import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

export class TradeDomainException {
  static creationFailed(): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'TRADE_CREATION_FAILED',
      message: '거래를 생성하지 못했어요. 잠시 후 다시 시도해 주세요.',
    });
  }

  static notFound(): NotFoundException {
    return new NotFoundException({
      code: 'TRADE_NOT_FOUND',
      message: '거래를 찾을 수 없어요.',
    });
  }

  static accessDenied(): ForbiddenException {
    return new ForbiddenException({
      code: 'TRADE_ACCESS_DENIED',
      message: '이 거래에 접근할 수 없어요.',
    });
  }

  static invalidAmount(): BadRequestException {
    return new BadRequestException({
      code: 'TRADE_INVALID_AMOUNT',
      message: '거래 금액이 올바르지 않아요.',
    });
  }

  static invalidStatus(): ConflictException {
    return new ConflictException({
      code: 'TRADE_INVALID_STATUS',
      message: '현재 거래 상태에서는 할 수 없는 행동이에요.',
    });
  }

  static onlyBuyerCanReportPayment(): ForbiddenException {
    return new ForbiddenException({
      code: 'TRADE_ONLY_BUYER_CAN_REPORT_PAYMENT',
      message: '입금 완료는 구매자만 선언할 수 있어요.',
    });
  }

  static onlySellerCanConfirmPayment(): ForbiddenException {
    return new ForbiddenException({
      code: 'TRADE_ONLY_SELLER_CAN_CONFIRM_PAYMENT',
      message: '입금 확인은 판매자만 할 수 있어요.',
    });
  }

  static onlySellerCanMarkUnpaid(): ForbiddenException {
    return new ForbiddenException({
      code: 'TRADE_ONLY_SELLER_CAN_MARK_UNPAID',
      message: '미입금 확정은 판매자만 할 수 있어요.',
    });
  }

  static cannotCancelAfterPayment(): ConflictException {
    return new ConflictException({
      code: 'TRADE_CANNOT_CANCEL_AFTER_PAYMENT',
      message: '입금 선언 이후에는 단측 취소할 수 없어요.',
    });
  }

  static alreadyCompleted(): ConflictException {
    return new ConflictException({
      code: 'TRADE_ALREADY_COMPLETED',
      message: '이미 완료된 거래예요.',
    });
  }

  static alreadyCancelled(): ConflictException {
    return new ConflictException({
      code: 'TRADE_ALREADY_CANCELLED',
      message: '이미 취소된 거래예요.',
    });
  }

  static coinTransferFailed(): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'TRADE_COIN_TRANSFER_FAILED',
      message: 'Coin 이전에 실패했어요. 잠시 후 다시 시도해 주세요.',
    });
  }

  static disputeAlreadyExists(): ConflictException {
    return new ConflictException({
      code: 'TRADE_DISPUTE_ALREADY_EXISTS',
      message: '이미 분쟁이 열린 거래예요.',
    });
  }
}
