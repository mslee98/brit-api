import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { PartnerClientProcessingModel } from '../domain/enums/partner-client-processing-model.enum';
import { PartnerClientScopeCode } from '../domain/enums/partner-client-scope-code.enum';

export class UpdatePartnerClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  webhookUrl?: string | null;

  @ApiPropertyOptional({ enum: PartnerClientProcessingModel })
  @IsOptional()
  @IsEnum(PartnerClientProcessingModel)
  processingModel?: PartnerClientProcessingModel;

  @ApiPropertyOptional({
    description: '업체 Operations base URL (예: http://localhost:5180)',
  })
  @ValidateIf((_, v) => v !== undefined)
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  operationsBaseUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'true면 Operations 서명 키를 새로 발급하고 응답에 원문을 한 번 포함',
  })
  @IsOptional()
  @IsBoolean()
  issueOperationsSigningSecret?: boolean;

  @ApiPropertyOptional({
    description:
      'true면 Webhook 서명 키를 새로 발급하고 응답에 원문을 한 번 포함',
  })
  @IsOptional()
  @IsBoolean()
  issueWebhookSecret?: boolean;

  @ApiPropertyOptional({ enum: PartnerClientScopeCode, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(PartnerClientScopeCode, { each: true })
  scopes?: PartnerClientScopeCode[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  origins?: string[];

  @ApiProperty({ example: 'Webhook URL 변경' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
