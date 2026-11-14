import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import { PartnerPaymentIntentStatus } from '../domain/enums/partner-payment-intent-status.enum';

export class CreatePartnerPaymentIntentDto {
  @ApiProperty({
    example: 'shop-order-991',
    description: '업체 주문 번호 (업체 내 unique · 멱등)',
  })
  @IsString()
  @Length(8, 100)
  externalOrderId!: string;

  @ApiProperty({ example: 'A-123', description: '업체 측 회원 키' })
  @IsString()
  @Length(1, 255)
  partnerUserKey!: string;

  @ApiProperty({
    example: '50000',
    description: 'CHARGE 금액 (MS 최소단위, 양의 정수 문자열)',
  })
  @IsString()
  @Matches(/^[1-9]\d*$/)
  amount!: string;

  @ApiProperty({
    example: 'http://localhost:5176',
    description: '팝업 결과를 받을 Origin. Client에 등록된 Origin만 허용',
  })
  @IsString()
  @MaxLength(255)
  returnOrigin!: string;

  @ApiPropertyOptional({
    example: 'POINT',
    description: '미지정 시 업체의 활성 기본 자산',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  assetCode?: string;

  @ApiPropertyOptional({
    description: '업체 메타 (상품명 등). BRIT는 해석하지 않음',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AuthorizePartnerPaymentIntentDto {
  @ApiProperty({ example: '123456', description: '거래 PIN 6자리' })
  @IsString()
  @Matches(/^\d{6}$/, { message: '거래 PIN은 6자리 숫자여야 해요.' })
  pin!: string;
}

export class PartnerPaymentIntentCreatedDto {
  intentId!: string;
  payUrl!: string;
  chargeAmountMs!: string;
  feeAmountMs!: string;
  totalDebitMs!: string;
  status!: PartnerPaymentIntentStatus;
  expiresAt!: string;
  expiresInSec!: number;
}

export class PartnerPaymentIntentViewDto {
  intentId!: string;
  externalOrderId!: string;
  partnerUserKey!: string;
  chargeAmountMs!: string;
  feeAmountMs!: string;
  totalDebitMs!: string;
  assetCode!: string | null;
  status!: PartnerPaymentIntentStatus;
  expiresAt!: string;
  partnerExchangeId!: string | null;
  failureCode!: string | null;
  failureMessage!: string | null;
  completedAt!: string | null;
  createdAt!: string;
}

export class EmbedPaymentIntentDto {
  intentId!: string;
  partnerName!: string;
  partnerCode!: string;
  partnerUserKeyMasked!: string;
  chargeAmountMs!: string;
  feeAmountMs!: string;
  totalDebitMs!: string;
  assetCode!: string | null;
  nonSellableBalanceMs!: string | null;
  status!: PartnerPaymentIntentStatus;
  returnOrigin!: string;
  expiresAt!: string;
  productName!: string | null;
  canAuthorize!: boolean;
  blockReason!: string | null;
}

export class EmbedPaymentIntentStatusDto {
  intentId!: string;
  status!: PartnerPaymentIntentStatus;
  returnOrigin!: string;
  partnerExchangeId!: string | null;
  failureCode!: string | null;
  failureMessage!: string | null;
}
