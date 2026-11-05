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

import { PartnerClientEnvironment } from '../domain/enums/partner-client-environment.enum';
import { PartnerClientScopeCode } from '../domain/enums/partner-client-scope-code.enum';
import { PartnerClientType } from '../domain/enums/partner-client-type.enum';

export class CreatePartnerClientDto {
  @ApiProperty({ enum: PartnerClientEnvironment })
  @IsEnum(PartnerClientEnvironment)
  environment!: PartnerClientEnvironment;

  @ApiProperty({ enum: PartnerClientType })
  @IsEnum(PartnerClientType)
  clientType!: PartnerClientType;

  @ApiProperty({ example: 'Sandbox Server' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiPropertyOptional({ example: 'https://shop.example/webhooks/brit' })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  webhookUrl?: string | null;

  @ApiProperty({
    enum: PartnerClientScopeCode,
    isArray: true,
    example: ['EXCHANGE_CHARGE', 'STATUS_READ'],
  })
  @IsArray()
  @ArrayUnique()
  @IsEnum(PartnerClientScopeCode, { each: true })
  scopes!: PartnerClientScopeCode[];

  @ApiPropertyOptional({
    type: [String],
    example: ['https://shop.example'],
    description: 'PUBLIC_SDK일 때 권장. SERVER는 선택.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  origins?: string[];

  @ApiProperty({ example: 'Sandbox Client 발급' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
