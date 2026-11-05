import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PartnerClientEnvironment } from '../domain/enums/partner-client-environment.enum';
import { PartnerClientScopeCode } from '../domain/enums/partner-client-scope-code.enum';
import { PartnerClientStatus } from '../domain/enums/partner-client-status.enum';
import { PartnerClientType } from '../domain/enums/partner-client-type.enum';
import { PartnerClientEntity } from '../infrastructure/entities/partner-client.entity';

export class PartnerClientResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  partnerId!: string;

  @ApiProperty({ description: 'SDK/API에 넣는 공개 client_id' })
  clientId!: string;

  @ApiProperty({ enum: PartnerClientType })
  clientType!: PartnerClientType;

  @ApiProperty({ enum: PartnerClientEnvironment })
  environment!: PartnerClientEnvironment;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  webhookUrl!: string | null;

  @ApiProperty({ enum: PartnerClientStatus })
  status!: PartnerClientStatus;

  @ApiProperty({ enum: PartnerClientScopeCode, isArray: true })
  scopes!: PartnerClientScopeCode[];

  @ApiProperty({ type: [String] })
  origins!: string[];

  @ApiProperty({ description: 'ACTIVE API_SECRET 존재 여부' })
  hasActiveApiSecret!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  static from(
    entity: PartnerClientEntity,
    extras?: {
      scopes?: PartnerClientScopeCode[];
      origins?: string[];
      hasActiveApiSecret?: boolean;
    },
  ): PartnerClientResponseDto {
    const dto = new PartnerClientResponseDto();
    dto.id = entity.id;
    dto.partnerId = entity.partnerId;
    dto.clientId = entity.clientId;
    dto.clientType = entity.clientType;
    dto.environment = entity.environment;
    dto.name = entity.name;
    dto.webhookUrl = entity.webhookUrl;
    dto.status = entity.status;
    dto.scopes =
      extras?.scopes ??
      (entity.scopes?.map((s) => s.scopeCode) ?? []);
    dto.origins =
      extras?.origins ?? (entity.origins?.map((o) => o.origin) ?? []);
    dto.hasActiveApiSecret = extras?.hasActiveApiSecret ?? false;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}

/** 발급·회전 직후에만 원문 Secret을 한 번 포함한다. */
export class PartnerClientIssuedResponseDto extends PartnerClientResponseDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'SERVER Client 발급/회전 시 한 번만 반환. 저장하지 마세요.',
  })
  apiSecretPlaintext!: string | null;

  static fromIssued(
    entity: PartnerClientEntity,
    extras: {
      scopes: PartnerClientScopeCode[];
      origins: string[];
      hasActiveApiSecret: boolean;
      apiSecretPlaintext: string | null;
    },
  ): PartnerClientIssuedResponseDto {
    const base = PartnerClientResponseDto.from(entity, extras);
    const dto = new PartnerClientIssuedResponseDto();
    Object.assign(dto, base);
    dto.apiSecretPlaintext = extras.apiSecretPlaintext;
    return dto;
  }
}
