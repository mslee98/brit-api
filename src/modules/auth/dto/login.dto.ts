import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'brit_user01' })
  @IsString()
  @IsNotEmpty()
  loginId!: string;

  @ApiProperty({ example: 'BritLogin!1', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8)
  @Length(8, 72)
  password!: string;

  /** 표시용 기기 이름 (예: iPhone, Chrome on Mac). IP는 서버가 채움. */
  @ApiPropertyOptional({ example: 'Chrome on Mac' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}
