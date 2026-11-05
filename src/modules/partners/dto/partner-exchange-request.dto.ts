import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class PartnerExchangeRequestDto {
  @ApiProperty({
    example: 'shop-order-991',
    description:
      '멱등 키 (업체 내 unique). Idempotency-Key 헤더와 동일해도 됨',
  })
  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;

  @ApiProperty({ example: 'A-123', description: '업체 측 회원 키' })
  @IsString()
  @Length(1, 255)
  partnerUserKey!: string;

  @ApiProperty({
    example: '50000',
    description: '전환 금액 (MS 최소단위, 양의 정수 문자열)',
  })
  @IsString()
  @Matches(/^[1-9]\d*$/)
  amount!: string;

  @ApiPropertyOptional({
    example: 'POINT',
    description: '미지정 시 업체의 활성 기본 자산',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  assetCode?: string;

  @ApiPropertyOptional({ example: 'txn-ext-1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  partnerTransactionId?: string | null;
}

export class CreateUserPartnerLinkDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'A-123' })
  @IsString()
  @Length(1, 255)
  partnerUserKey!: string;
}

export class CreatePartnerAssetDto {
  @ApiProperty({ example: 'POINT' })
  @IsString()
  @Length(1, 30)
  @Matches(/^[A-Za-z0-9_-]+$/)
  assetCode!: string;

  @ApiProperty({ example: '샵 포인트' })
  @IsString()
  @Length(1, 100)
  assetName!: string;

  @ApiPropertyOptional({ example: 'POINT', default: 'POINT' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  assetType?: string;
}
