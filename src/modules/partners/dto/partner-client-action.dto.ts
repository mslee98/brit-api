import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class PartnerClientActionDto {
  @ApiProperty({ example: 'Secret 회전' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}
