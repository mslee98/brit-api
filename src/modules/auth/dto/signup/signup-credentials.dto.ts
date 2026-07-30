import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class SignupCredentialsDto {
  @IsString()
  @Matches(/^[a-z0-9_]{4,20}$/)
  loginId!: string;

  @IsString()
  @MinLength(8)
  @Length(8, 72)
  loginPassword!: string;

  /** 선택. 미전달·빈 문자열이면 null로 저장한다. */
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsOptional()
  @IsString()
  @Matches(/^[가-힣a-zA-Z0-9_]{2,12}$/)
  nickname?: string;
}
