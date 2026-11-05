import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreatePartnerDto {
  @ApiProperty({ example: 'SHOP_A' })
  @IsString()
  @Length(2, 30)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;

  @ApiProperty({ example: '에이샵' })
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ example: '홍길동' })
  @IsString()
  @Length(1, 50)
  contactName!: string;

  @ApiProperty({ example: '01012345678' })
  @IsString()
  @Length(1, 30)
  contactPhone!: string;

  @ApiProperty({ example: 'ops@shop-a.example' })
  @IsEmail()
  @MaxLength(100)
  contactEmail!: string;

  @ApiPropertyOptional({ example: '@shop_a_ops' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactTelegram?: string | null;

  @ApiPropertyOptional({ example: '카톡 2026-11-04 접수' })
  @IsOptional()
  @IsString()
  memo?: string | null;

  @ApiPropertyOptional({ example: '신규 제휴 등록' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
