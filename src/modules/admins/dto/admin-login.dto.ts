import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'sysadmin' })
  @IsString()
  @Length(4, 30)
  @Matches(/^[a-zA-Z0-9_]+$/)
  loginId!: string;

  @ApiProperty()
  @IsString()
  @Length(8, 72)
  password!: string;
}
