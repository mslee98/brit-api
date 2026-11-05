import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class PartnerDomainException {
  static notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_NOT_FOUND',
      message: '업체를 찾을 수 없어요.',
    });
  }

  static codeDuplicate(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_CODE_DUPLICATE',
      message: '이미 사용 중인 업체 코드예요.',
    });
  }

  static invalidStatusTransition(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_INVALID_STATUS_TRANSITION',
      message: '해당 상태로는 변경할 수 없어요.',
    });
  }

  static terminated(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_TERMINATED',
      message: '종료된 업체에는 담당자를 추가할 수 없어요.',
    });
  }

  static memberNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_MEMBER_NOT_FOUND',
      message: '업체 담당자를 찾을 수 없어요.',
    });
  }

  static memberUserNotActive(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_MEMBER_USER_NOT_ACTIVE',
      message: 'ACTIVE 사용자만 업체 담당자로 연결할 수 있어요.',
    });
  }

  static memberAlreadyAssigned(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_MEMBER_ALREADY_ASSIGNED',
      message: '이미 다른 업체에 소속된 사용자예요. 재배정을 이용해 주세요.',
    });
  }

  static memberAlreadyOnPartner(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_MEMBER_ALREADY_ON_PARTNER',
      message: '이미 이 업체에 소속된 사용자예요.',
    });
  }

  static memberNotAssigned(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_MEMBER_NOT_ASSIGNED',
      message: '재배정할 활성 소속이 없어요. 신규 연결을 이용해 주세요.',
    });
  }

  static userNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_MEMBER_USER_NOT_FOUND',
      message: '연결할 사용자를 찾을 수 없어요.',
    });
  }

  static clientNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_CLIENT_NOT_FOUND',
      message: '업체 Client를 찾을 수 없어요.',
    });
  }

  static clientRevoked(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_CLIENT_REVOKED',
      message: '이미 폐기된 Client예요.',
    });
  }

  static clientNotActive(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_CLIENT_NOT_ACTIVE',
      message: 'ACTIVE Client만 Secret을 회전할 수 있어요.',
    });
  }

  static clientSecretNotApplicable(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_CLIENT_SECRET_NOT_APPLICABLE',
      message: 'SERVER Client만 API Secret을 발급·회전할 수 있어요.',
    });
  }

  static clientScopesRequired(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_CLIENT_SCOPES_REQUIRED',
      message: '하나 이상의 Scope가 필요해요.',
    });
  }

  static clientOriginsRequired(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_CLIENT_ORIGINS_REQUIRED',
      message: 'PUBLIC_SDK Client는 허용 Origin이 하나 이상 필요해요.',
    });
  }

  static portalForbidden(): ForbiddenException {
    return new ForbiddenException({
      code: 'PARTNER_PORTAL_FORBIDDEN',
      message: '업체 포털에 접근할 수 없어요.',
    });
  }

  static portalMembershipRequired(): ForbiddenException {
    return new ForbiddenException({
      code: 'PARTNER_PORTAL_MEMBERSHIP_REQUIRED',
      message: '업체 담당자로 연결되어 있지 않아요.',
    });
  }

  static portalPartnerTerminated(): ForbiddenException {
    return new ForbiddenException({
      code: 'PARTNER_PORTAL_TERMINATED',
      message: '종료된 업체의 포털은 이용할 수 없어요.',
    });
  }

  static feePolicyNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_FEE_POLICY_NOT_FOUND',
      message: '수수료 정책을 찾을 수 없어요.',
    });
  }

  static feePolicyInactive(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_FEE_POLICY_INACTIVE',
      message: '이미 비활성인 수수료 정책이에요.',
    });
  }

  static feePolicyInvalidPeriod(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_FEE_POLICY_INVALID_PERIOD',
      message: 'effectiveTo는 effectiveFrom 이후여야 해요.',
    });
  }

  static partnerNotActive(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_NOT_ACTIVE',
      message: '활성 업체만 전환할 수 있어요.',
    });
  }

  static partnerWalletSuspended(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_WALLET_SUSPENDED',
      message: '업체 Coin 지갑이 중지 상태예요.',
    });
  }

  static invalidExchangeAmount(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_EXCHANGE_INVALID_AMOUNT',
      message: '전환 금액이 올바르지 않아요.',
    });
  }

  static linkNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_USER_LINK_NOT_FOUND',
      message: '업체와 연결된 사용자를 찾을 수 없어요.',
    });
  }

  static linkAlreadyExists(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_USER_LINK_ALREADY_EXISTS',
      message: '이미 연결된 업체 회원 키예요.',
    });
  }

  static assetNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_ASSET_NOT_FOUND',
      message: '업체 자산을 찾을 수 없어요.',
    });
  }

  static feePolicyMissing(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_FEE_POLICY_MISSING',
      message: '적용 가능한 수수료 정책이 없어요.',
    });
  }

  static exchangeIdempotencyConflict(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_EXCHANGE_IDEMPOTENCY_CONFLICT',
      message: '같은 Idempotency-Key로 다른 요청이 이미 있어요.',
    });
  }

  static clientAuthRequired(): ForbiddenException {
    return new ForbiddenException({
      code: 'PARTNER_CLIENT_AUTH_REQUIRED',
      message: '업체 Client 인증이 필요해요.',
    });
  }

  static clientAuthInvalid(): ForbiddenException {
    return new ForbiddenException({
      code: 'PARTNER_CLIENT_AUTH_INVALID',
      message: '업체 Client 인증에 실패했어요.',
    });
  }

  static clientScopeDenied(scope: string): ForbiddenException {
    return new ForbiddenException({
      code: 'PARTNER_CLIENT_SCOPE_DENIED',
      message: `필요한 Scope가 없어요: ${scope}`,
    });
  }

  static userNotActiveForLink(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_USER_NOT_ACTIVE',
      message: 'ACTIVE 사용자만 업체에 연결할 수 있어요.',
    });
  }
}
