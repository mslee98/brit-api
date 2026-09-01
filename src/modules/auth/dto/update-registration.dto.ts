import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class UpdateRegistrationBankAccountDto {
  @IsString()
  @MaxLength(20)
  bankCode!: string;

  @IsString()
  accountNumber!: string;

  @IsString()
  @Length(2, 50)
  holderName!: string;
}

export class UpdateRegistrationDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateRegistrationBankAccountDto)
  bankAccount?: UpdateRegistrationBankAccountDto;
}
