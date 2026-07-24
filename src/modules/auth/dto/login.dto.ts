import { IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  loginId!: string;

  @IsString()
  @MinLength(8)
  @Length(8, 72)
  password!: string;
}
