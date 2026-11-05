import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class PartnerStatusActionDto {
  @ApiProperty({ example: '계약 일시 중지' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
