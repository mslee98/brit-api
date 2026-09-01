import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RevokeAdminSessionsDto {
  @ApiProperty()
  @IsString()
  @Length(1, 500)
  reason!: string;
}
