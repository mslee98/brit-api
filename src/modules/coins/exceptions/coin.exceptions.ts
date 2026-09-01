import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class CoinDomainException {
  static walletNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'COIN_WALLET_NOT_FOUND',
      message: 'Coin 지갑을 찾을 수 없어요.',
    });
  }

  static walletSuspended(): ConflictException {
    return new ConflictException({
      code: 'COIN_WALLET_SUSPENDED',
      message: '정지된 Coin 지갑이에요. 지금은 변경할 수 없어요.',
    });
  }

  static balanceInsufficient(): ConflictException {
    return new ConflictException({
      code: 'COIN_BALANCE_INSUFFICIENT',
      message: 'Coin 잔액이 부족해요.',
    });
  }

  static sellableBalanceInsufficient(): ConflictException {
    return new ConflictException({
      code: 'COIN_SELLABLE_BALANCE_INSUFFICIENT',
      message: '판매 가능 Coin 잔액이 부족해요.',
    });
  }

  static lotNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'COIN_LOT_NOT_FOUND',
      message: 'Coin Lot을 찾을 수 없어요.',
    });
  }

  static lotNotAvailable(): ConflictException {
    return new ConflictException({
      code: 'COIN_LOT_NOT_AVAILABLE',
      message: '사용할 수 없는 Coin Lot이에요.',
    });
  }

  static transactionAlreadyProcessed(): ConflictException {
    return new ConflictException({
      code: 'COIN_TRANSACTION_ALREADY_PROCESSED',
      message: '이미 처리된 Coin 거래예요.',
    });
  }

  static invalidAmount(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_COIN_AMOUNT',
      message: 'Coin 금액이 올바르지 않아요.',
    });
  }

  static adminAdjustmentNotAllowed(): ForbiddenException {
    return new ForbiddenException({
      code: 'ADMIN_COIN_ADJUSTMENT_NOT_ALLOWED',
      message: '이 Coin 보정은 허용된 관리자만 할 수 있어요.',
    });
  }

  static purchaseNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'COIN_PURCHASE_NOT_FOUND',
      message: 'Coin 구매 건을 찾을 수 없어요.',
    });
  }

  static userNotActive(): ConflictException {
    return new ConflictException({
      code: 'COIN_USER_NOT_ACTIVE',
      message: 'ACTIVE 사용자만 Coin을 변경할 수 있어요.',
    });
  }

  static userNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'USER_NOT_FOUND',
      message: '사용자를 찾을 수 없어요.',
    });
  }

  static idempotencyKeyRequired(): BadRequestException {
    return new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key 헤더가 필요해요.',
    });
  }

  static invalidIdempotencyKey(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key는 UUID여야 해요.',
    });
  }

  static idempotencyKeyConflict(): ConflictException {
    return new ConflictException({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      message: '동일한 Idempotency-Key로 다른 내용의 요청이 이미 있어요.',
    });
  }

  static requestInProgress(): ConflictException {
    return new ConflictException({
      code: 'REQUEST_IN_PROGRESS',
      message: '동일한 요청이 처리 중이에요. 잠시 후 다시 시도해 주세요.',
    });
  }
}
