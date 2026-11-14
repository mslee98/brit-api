import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { PartnerClientScopeCode } from '../domain/enums/partner-client-scope-code.enum';
import { PartnerClientType } from '../domain/enums/partner-client-type.enum';

/** 업체 포털 셀프 발급. 환경은 항상 SANDBOX로 고정한다. */
export class CreatePortalPartnerClientDto {
  @ApiProperty({ enum: PartnerClientType })
  @IsEnum(PartnerClientType)
  clientType!: PartnerClientType;

  @ApiProperty({ example: 'Sandbox Server' })
  @IsString()
  @Length(1, 100)
  name!: string;

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
    example: ['http://localhost:5176'],
    description: 'PUBLIC_SDK는 필수',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  origins?: string[];
}

/** 업체 포털 수정. 이름·허용 Origin만 바꿀 수 있다. */
export class UpdatePortalPartnerClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  origins?: string[];
}
