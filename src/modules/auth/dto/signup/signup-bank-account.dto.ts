import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** 가입 시 제출하는 계좌 정보. 외부 인증 없이 PENDING_APPROVAL로 저장된다. */
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
}
