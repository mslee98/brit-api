import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export class MatchingDomainException {
  static buyOrderNotMatchable(): ConflictException {
    return new ConflictException({
      code: 'MATCHING_BUY_ORDER_NOT_MATCHABLE',
      message: '이 구매 주문은 매칭할 수 없는 상태예요.',
    });
  }

  static alreadyMatched(): ConflictException {
    return new ConflictException({
      code: 'MATCHING_ALREADY_MATCHED',
      message: '이미 매칭이 완료된 주문이에요.',
    });
  }

  static sellOrderUnavailable(): ConflictException {
    return new ConflictException({
      code: 'SELL_ORDER_UNAVAILABLE',
      message: '이 판매 건은 방금 다른 거래로 연결됐어요.',
    });
  }

  static candidateChanged(): ConflictException {
    return new ConflictException({
      code: 'CANDIDATE_CHANGED',
      message: '판매 조건이 변경됐어요. 다시 확인해 주세요.',
    });
  }

  static sellOrderChanged(): ConflictException {
    return new ConflictException({
      code: 'MATCHING_SELL_ORDER_CHANGED',
      message: '판매 주문 상태가 변경되어 매칭을 다시 시도해요.',
    });
  }

  static buyOrderPendingRequest(): ConflictException {
    return new ConflictException({
      code: 'BUY_ORDER_PENDING_REQUEST',
      message: '이미 판매자 수락을 기다리는 신청이 있어요.',
    });
  }

  static sellOrderPendingRequest(): ConflictException {
    return new ConflictException({
      code: 'SELL_ORDER_PENDING_REQUEST',
      message: '이 판매 건은 다른 구매자의 신청을 처리 중이에요.',
    });
  }

  static buyOrderRequestPending(): ConflictException {
    return new ConflictException({
      code: 'BUY_ORDER_REQUEST_PENDING',
      message:
        '판매자 수락 대기 중이에요. 신청을 취소하거나 결과를 기다려 주세요.',
    });
  }

  static buyOrderNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'BUY_ORDER_NOT_FOUND',
      message: '구매 주문을 찾을 수 없어요.',
    });
  }

  static tradeRequestNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'TRADE_REQUEST_NOT_FOUND',
      message: '거래 신청을 찾을 수 없어요.',
    });
  }

  static tradeRequestExpired(): ConflictException {
    return new ConflictException({
      code: 'TRADE_REQUEST_EXPIRED',
      message: '거래 신청 시간이 지났어요. 다시 신청해 주세요.',
    });
  }

  static requestStale(): ConflictException {
    return new ConflictException({
      code: 'REQUEST_STALE',
      message: '신청 정보가 더 이상 유효하지 않아요. 다시 시도해 주세요.',
    });
  }

  static tradeRequestNotPending(): ConflictException {
    return new ConflictException({
      code: 'TRADE_REQUEST_NOT_PENDING',
      message: '이미 처리된 거래 신청이에요.',
    });
  }

  static matchingPolicyNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'MATCHING_POLICY_NOT_FOUND',
      message: '활성 매칭 정책을 찾을 수 없어요.',
    });
  }

  static invalidCursor(): ConflictException {
    return new ConflictException({
      code: 'INVALID_CANDIDATE_CURSOR',
      message: '후보 목록 커서가 올바르지 않아요.',
    });
  }
}
