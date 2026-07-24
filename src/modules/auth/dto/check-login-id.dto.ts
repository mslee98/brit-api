import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CheckLoginIdDto {
  @ApiProperty({ example: 'brit_user01' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]{4,20}$/)
  loginId!: string;
}
