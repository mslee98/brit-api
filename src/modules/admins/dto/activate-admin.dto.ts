import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ActivateAdminDto {
  @ApiProperty()
  @IsString()
  @Length(1, 500)
  reason!: string;
}
