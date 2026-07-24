import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CheckNicknameDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[가-힣a-zA-Z0-9_]{2,12}$/)
  nickname!: string;
}
