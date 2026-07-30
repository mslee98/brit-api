import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export class UserApprovalDomainException {
  static notFound(): NotFoundException {
    return new NotFoundException({
      code: 'USER_APPROVAL_NOT_FOUND',
      message: '가입 승인 대상을 찾을 수 없어요.',
    });
  }

  static notPending(): ConflictException {
    return new ConflictException({
      code: 'USER_APPROVAL_NOT_PENDING',
      message: '이미 처리된 가입 신청이에요.',
    });
  }

  static bankAccountNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'USER_APPROVAL_BANK_ACCOUNT_NOT_FOUND',
      message: '승인할 가입 계좌를 찾을 수 없어요.',
    });
  }

  static checklistIncomplete(): BadRequestException {
    return new BadRequestException({
      code: 'USER_APPROVAL_CHECKLIST_INCOMPLETE',
      message: '승인하려면 신원·전화·계좌·예금주 확인이 모두 필요해요.',
    });
  }

  static rejectionReasonRequired(): BadRequestException {
    return new BadRequestException({
      code: 'USER_APPROVAL_REJECTION_REASON_REQUIRED',
      message: '반려 사유를 입력해 주세요.',
    });
  }
}
