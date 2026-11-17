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

  static portalOwnerRequired(): ForbiddenException {
    return new ForbiddenException({
      code: 'PARTNER_PORTAL_OWNER_REQUIRED',
      message: '대표 담당자(OWNER)만 연동 키를 관리할 수 있어요.',
    });
  }

  static portalPartnerNotActive(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_PORTAL_NOT_ACTIVE',
      message: '활성 업체만 연동 키를 관리할 수 있어요.',
    });
  }

  static portalClientSandboxOnly(): ForbiddenException {
    return new ForbiddenException({
      code: 'PARTNER_PORTAL_CLIENT_SANDBOX_ONLY',
      message: '업체 포털에서는 Sandbox 연동 키만 관리할 수 있어요. 운영 키는 BRIT 운영팀에 요청해 주세요.',
    });
  }

  static portalClientScopeNotAllowed(scope: string): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_PORTAL_CLIENT_SCOPE_NOT_ALLOWED',
      message: `업체 포털에서 선택할 수 없는 권한이에요: ${scope}`,
    });
  }

  static portalClientLimitExceeded(limit: number): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_PORTAL_CLIENT_LIMIT_EXCEEDED',
      message: `Sandbox 연동 키는 최대 ${limit}개까지 만들 수 있어요.`,
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

  static creditLimitExceeded(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_CREDIT_LIMIT_EXCEEDED',
      message: '업체 마이너스 한도를 넘어 환전할 수 없어요.',
    });
  }

  static invalidCreditLimit(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_CREDIT_LIMIT_INVALID',
      message: '마이너스 한도는 0 이상의 정수여야 해요.',
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
      message: '이미 다른 BRIT 회원과 연결된 업체 회원 키예요.',
    });
  }

  static userAlreadyLinkedOtherKey(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_USER_ALREADY_LINKED',
      message:
        '이미 이 업체의 다른 회원 계정과 연결돼 있어요. 기존 연결을 해제한 뒤 다시 시도해 주세요.',
    });
  }

  static linkSessionNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_LINK_SESSION_NOT_FOUND',
      message: '연결 요청을 찾을 수 없어요. 업체 화면에서 다시 시도해 주세요.',
    });
  }

  static linkSessionExpired(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_SESSION_EXPIRED',
      message: '연결 요청 시간이 지났어요. 업체 화면에서 다시 시도해 주세요.',
    });
  }

  static linkSessionAlreadyUsed(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_LINK_SESSION_ALREADY_USED',
      message: '이미 처리된 연결 요청이에요.',
    });
  }

  static linkOriginNotAllowed(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_ORIGIN_NOT_ALLOWED',
      message: 'returnOrigin이 Client에 등록된 Origin이 아니에요.',
    });
  }

  static linkCodeInvalid(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_CODE_INVALID',
      message: '연결 code가 올바르지 않거나 만료됐어요.',
    });
  }

  static linkPairingCodeInvalid(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_PAIRING_CODE_INVALID',
      message: '연결 코드가 올바르지 않아요. BRIT 팝업에 표시된 숫자를 다시 입력해 주세요.',
    });
  }

  static linkPairingCodeExpired(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_PAIRING_CODE_EXPIRED',
      message: '연결 코드가 만료됐어요. 업체 화면에서 다시 연결을 시작해 주세요.',
    });
  }

  static linkPairingAttemptsExceeded(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_PAIRING_ATTEMPTS_EXCEEDED',
      message: '연결 코드 입력 횟수를 초과했어요. 업체 화면에서 다시 연결을 시작해 주세요.',
    });
  }

  static linkPairingCodeRequired(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_PAIRING_CODE_REQUIRED',
      message: 'BRIT 팝업에 표시된 4자리 연결 코드를 입력해 주세요.',
    });
  }

  /** Embed consent로는 NEW 연결 불가 — BRIT 클라이언트 승인 사용 */
  static linkClientApprovalRequired(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_CLIENT_APPROVAL_REQUIRED',
      message:
        '신규 연결은 BRIT 앱·웹에서 연결 코드로 승인해 주세요. 팝업에서는 대기만 합니다.',
    });
  }

  static linkSessionClaimedByOther(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_LINK_SESSION_CLAIMED_BY_OTHER',
      message:
        '다른 BRIT 계정으로 이미 진행 중인 연결이에요. 팝업에서 계정을 바꾸거나 업체에서 다시 시작해 주세요.',
    });
  }

  static linkSessionNotClaimed(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_LINK_SESSION_NOT_CLAIMED',
      message: '연결 팝업에서 먼저 BRIT에 로그인해 주세요.',
    });
  }

  static linkApprovalConflict(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_LINK_APPROVAL_CONFLICT',
      message: '이 계정으로는 연결할 수 없어요. 안내를 확인해 주세요.',
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

  static userNotActiveForExchange(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_EXCHANGE_USER_NOT_ACTIVE',
      message: 'ACTIVE 사용자만 충전·환전할 수 있어요.',
    });
  }

  static paymentIntentNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_PAYMENT_INTENT_NOT_FOUND',
      message: '충전 요청을 찾을 수 없어요. 업체 화면에서 다시 시도해 주세요.',
    });
  }

  static paymentIntentExpired(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_PAYMENT_INTENT_EXPIRED',
      message: '충전 요청 시간이 지났어요. 업체 화면에서 다시 시도해 주세요.',
    });
  }

  static paymentIntentNotAuthorizable(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_PAYMENT_INTENT_NOT_AUTHORIZABLE',
      message: '이미 처리됐거나 승인할 수 없는 충전 요청이에요.',
    });
  }

  static paymentIntentConflict(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_PAYMENT_INTENT_CONFLICT',
      message: '같은 주문번호로 다른 금액·회원 키가 이미 있어요.',
    });
  }

  /** Embed lock 후 다른 금액으로 재lock 시도 */
  static paymentIntentAmountAlreadyLocked(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_PAYMENT_INTENT_AMOUNT_LOCKED',
      message:
        '이미 확정된 충전 금액이 있어요. 바꾸려면 취소 후 다시 시작해 주세요.',
    });
  }

  static paymentIntentUserMismatch(): ForbiddenException {
    return new ForbiddenException({
      code: 'PARTNER_PAYMENT_INTENT_USER_MISMATCH',
      message:
        '이 BRIT 계정은 해당 업체 회원과 연결되어 있지 않아요. 연결한 계정으로 로그인해 주세요.',
    });
  }

  static paymentIntentNotLinked(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_PAYMENT_INTENT_NOT_LINKED',
      message: '먼저 업체와 BRIT 계정을 연결해 주세요.',
    });
  }

  static paymentIntentAmountRequired(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_PAYMENT_INTENT_AMOUNT_REQUIRED',
      message: '충전 금액을 먼저 확정해 주세요.',
    });
  }

  static paymentIntentInsufficientBalance(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_PAYMENT_INTENT_INSUFFICIENT_BALANCE',
      message: '충전 가능 잔액이 부족해요. 금액을 바꿔 주세요.',
    });
  }

  static exchangeNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_EXCHANGE_NOT_FOUND',
      message: '전환 거래를 찾을 수 없어요.',
    });
  }

  static operationsNotConfigured(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_OPERATIONS_NOT_CONFIGURED',
      message:
        '업체 Operations URL·서명 키·처리 모델(BRIT_OPERATIONS)을 설정해 주세요.',
    });
  }

  static operationsConfirmForbidden(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_OPERATIONS_CONFIRM_FORBIDDEN',
      message:
        '이 Client는 BRIT Operations로 지급합니다. confirm 적립을 사용할 수 없어요.',
    });
  }

  static operationsUrlInvalid(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_OPERATIONS_URL_INVALID',
      message:
        'Operations URL이 올바르지 않아요. Sandbox는 localhost 허용, Production은 HTTPS·공인 호스트만 가능해요.',
    });
  }

  static webhookUrlInvalid(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_WEBHOOK_URL_INVALID',
      message:
        'Webhook URL이 올바르지 않아요. Sandbox는 localhost 허용, Production은 HTTPS·공인 호스트만 가능해요.',
    });
  }

  static settlementNotReady(externalStatus: string): ConflictException {
    return new ConflictException({
      code: 'PARTNER_SETTLEMENT_NOT_READY',
      message: `외부 결과가 확정되지 않아 원장을 닫을 수 없어요. (${externalStatus})`,
    });
  }

  static settlementConflict(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_SETTLEMENT_CONFLICT',
      message: '이미 다른 최종 상태로 확정된 전환이에요.',
    });
  }

  static settlementNotCharge(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_SETTLEMENT_NOT_CHARGE',
      message: 'CHARGE 전환만 이 확정 경로를 사용할 수 있어요.',
    });
  }

  static settlementEvidenceMissing(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_SETTLEMENT_EVIDENCE_MISSING',
      message: '업체 지급 거래번호(partnerTransactionId)가 없어 확정할 수 없어요.',
    });
  }

  static settlementLotsInvalid(): ConflictException {
    return new ConflictException({
      code: 'PARTNER_SETTLEMENT_LOTS_INVALID',
      message: '잠금 Lot 할당이 금액과 맞지 않아요. 대사가 필요해요.',
    });
  }

  static exchangePartnerMismatch(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_EXCHANGE_PARTNER_MISMATCH',
      message: '해당 업체의 전환 거래를 찾을 수 없어요.',
    });
  }

  static webhookDeliveryNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PARTNER_WEBHOOK_DELIVERY_NOT_FOUND',
      message: 'Webhook Delivery를 찾을 수 없어요.',
    });
  }

  static opsNoteRequired(): BadRequestException {
    return new BadRequestException({
      code: 'PARTNER_OPS_NOTE_REQUIRED',
      message: '운영 메모를 입력해 주세요.',
    });
  }
}
