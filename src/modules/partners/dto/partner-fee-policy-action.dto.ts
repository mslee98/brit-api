import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class PartnerFeePolicyActionDto {
  @ApiProperty({ example: '정책 종료' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
