import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/** Access Token 만료 시 Refresh Cookie/body로 로그아웃 */
export class AdminLogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(10, 512)
  refreshToken?: string;
}
