import { IsString, Matches } from 'class-validator';

export class SignupSecurityDto {
  @IsString()
  @Matches(/^\d{6}$/)
  pin!: string;
}
