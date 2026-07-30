import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupBankAccountDto {
  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @IsString()
  @MinLength(10)
  @Matches(/^\d+$/)
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  accountHolderName!: string;

  @IsString()
  @IsNotEmpty()
  accountVerifyToken!: string;
}
