import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @IsString()
  @MinLength(10)
  @Matches(/^\d+$/)
  accountNumber!: string;
}
