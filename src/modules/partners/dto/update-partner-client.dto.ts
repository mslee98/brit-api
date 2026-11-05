import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

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
