import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export class OrderDomainException {
  static buyOrderNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'BUY_ORDER_NOT_FOUND',
      message: '구매 주문을 찾을 수 없어요.',
    });
  }

  static sellOrderNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'SELL_ORDER_NOT_FOUND',
      message: '판매 주문을 찾을 수 없어요.',
    });
  }

  static orderNotCancellable(): ConflictException {
    return new ConflictException({
      code: 'ORDER_NOT_CANCELLABLE',
      message: '이 주문은 취소할 수 없어요.',
    });
  }

  static orderAlreadyMatched(): ConflictException {
    return new ConflictException({
      code: 'ORDER_ALREADY_MATCHED',
      message: '이미 매칭된 주문이에요. 주문 취소가 아니라 거래 정책을 따라야 해요.',
    });
  }

  static orderAlreadyCancelled(): ConflictException {
    return new ConflictException({
      code: 'ORDER_ALREADY_CANCELLED',
      message: '이미 취소된 주문이에요.',
    });
  }

  static invalidOrderAmount(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_ORDER_AMOUNT',
      message: '주문 금액이 올바르지 않아요.',
    });
  }

  static matchingPolicyNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'MATCHING_POLICY_NOT_FOUND',
      message: '활성 매칭 정책을 찾을 수 없어요.',
    });
  }

  static sellOrderMinimumTradeInvalid(): BadRequestException {
    return new BadRequestException({
      code: 'SELL_ORDER_MINIMUM_TRADE_INVALID',
      message: '최소 거래 금액을 계산할 수 없어요. 판매 금액을 확인해 주세요.',
    });
  }

  static duplicateOrderRequest(): ConflictException {
    return new ConflictException({
      code: 'DUPLICATE_ORDER_REQUEST',
      message: '동일한 Idempotency-Key로 다른 내용의 주문이 이미 있어요.',
    });
  }

  static idempotencyKeyRequired(): BadRequestException {
    return new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key 헤더가 필요해요.',
    });
  }
}
