import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UserStatus } from '../domain/enums/user-status.enum';

export class SearchRegistrationReviewsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  keyword?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
