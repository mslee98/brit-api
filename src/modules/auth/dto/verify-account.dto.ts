import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class VerifyAccountDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @IsString()
  @MinLength(10)
  @Matches(/^\d+$/)
  accountNumber!: string;
}
