import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { AuditActionType } from '../domain/enums/audit-action-type.enum';

function toActionTypeArray(value: unknown): AuditActionType[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const items = Array.isArray(value) ? value : String(value).split(',');
  const parsed = items.map((item) => String(item).trim()).filter(Boolean);
  return parsed.length > 0 ? (parsed as AuditActionType[]) : undefined;
}

export class SearchAuditLogsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @ApiPropertyOptional({ enum: AuditActionType })
  @IsOptional()
  @IsEnum(AuditActionType)
  actionType?: AuditActionType;

  @ApiPropertyOptional({
    enum: AuditActionType,
    isArray: true,
    description: '복수 actionType (쉼표 구분 또는 반복 query)',
  })
  @IsOptional()
  @Transform(({ value }) => toActionTypeArray(value))
  @IsEnum(AuditActionType, { each: true })
  actionTypes?: AuditActionType[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Type(() => String)
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO8601' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
}
