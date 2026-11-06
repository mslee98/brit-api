import { BadRequestException, NotFoundException } from '@nestjs/common';

export class TransactionDomainException {
  static notFound(): NotFoundException {
    return new NotFoundException({
      code: 'TRANSACTION_NOT_FOUND',
      message: '거래내역을 찾을 수 없어요.',
    });
  }

  static invalidCursor(): BadRequestException {
    return new BadRequestException({
      code: 'TRANSACTION_INVALID_CURSOR',
      message: '목록 위치가 올바르지 않아요. 처음부터 다시 불러와 주세요.',
    });
  }
}
