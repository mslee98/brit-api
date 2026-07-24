import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'brit_user01' })
  @IsString()
  @IsNotEmpty()
  loginId!: string;

  @ApiProperty({ example: 'BritLogin!1', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @Length(8, 72)
  password!: string;
}
