import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CheckLoginIdDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]{4,20}$/)
  loginId!: string;
}
