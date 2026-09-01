import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import { CheckLoginIdDto } from './dto/check-login-id.dto';
import { CheckNicknameDto } from './dto/check-nickname.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
/**
 * Auth HTTP 진입점.
 *
 * 가입 전 체크: login-id/check, nickname/check
 * 가입: register (201, 토큰 없음) — 계좌·본인 외부인증 없음
 * 이후: login → refresh → logout(Bearer)
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login-id/check')
  @HttpCode(200)
  @ApiOperation({ summary: '로그인 ID 사용 가능 여부' })
  checkLoginId(@Body() body: CheckLoginIdDto) {
    return this.authService.checkLoginId(body);
  }

  @Post('nickname/check')
  @HttpCode(200)
  @ApiOperation({ summary: '닉네임 사용 가능 여부' })
  checkNickname(@Body() body: CheckNicknameDto) {
    return this.authService.checkNickname(body);
  }

  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: '회원가입 (승인 대기, 토큰 미발급)' })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '로그인' })
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Access/Refresh 토큰 갱신' })
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '로그아웃 (현재 세션 revoke)' })
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user.sessionId);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '로그아웃 (전체 세션 revoke)' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logoutAll(user.userId);
  }

  @Get('me')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 정보 및 진입 상태' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.userId);
  }

  @Get('registration-status')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '가입 심사 상태 조회' })
  registrationStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getRegistrationStatus(user.userId);
  }

  @Patch('registration')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '가입 정보 수정/재제출' })
  updateRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateRegistrationDto,
  ) {
    return this.authService.updateRegistration(user.userId, body);
  }
}
