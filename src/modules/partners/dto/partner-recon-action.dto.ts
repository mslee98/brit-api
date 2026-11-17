import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/** B4-6 sync/settle/webhook retry 선택 사유 */
export class PartnerReconActionDto {
  @ApiPropertyOptional({ example: '운영 조사 후 STATUS 재조회' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
