import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RemovePartnerMemberDto {
  @ApiProperty({ example: '담당자 퇴사' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
