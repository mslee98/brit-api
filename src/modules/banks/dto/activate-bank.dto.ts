import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ActivateBankDto {
  @ApiProperty()
  @IsString()
  @Length(1, 500)
  reason!: string;
}
