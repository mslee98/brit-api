import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PartnerExchangeType } from '../domain/enums/partner-exchange-type.enum';
import { PartnerFeeAccrualStatus } from '../domain/enums/partner-fee-accrual-status.enum';

export class SearchPartnerFeeAccrualsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PartnerExchangeType })
  @IsOptional()
  @IsEnum(PartnerExchangeType)
  exchangeType?: PartnerExchangeType;

  @ApiPropertyOptional({ enum: PartnerFeeAccrualStatus })
  @IsOptional()
  @IsEnum(PartnerFeeAccrualStatus)
  status?: PartnerFeeAccrualStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;
}
