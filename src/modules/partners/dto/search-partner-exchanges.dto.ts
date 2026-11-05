import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PartnerExchangeStatus } from '../domain/enums/partner-exchange-status.enum';
import { PartnerExchangeType } from '../domain/enums/partner-exchange-type.enum';

export class SearchPartnerExchangesDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PartnerExchangeType })
  @IsOptional()
  @IsEnum(PartnerExchangeType)
  exchangeType?: PartnerExchangeType;

  @ApiPropertyOptional({ enum: PartnerExchangeStatus })
  @IsOptional()
  @IsEnum(PartnerExchangeStatus)
  status?: PartnerExchangeStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;
}
