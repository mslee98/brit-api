import {
  Body,
  Controller,
  HttpCode,
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
import { SignupDto } from './dto/signup.dto';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
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

  @Post('accounts/verify')
  @HttpCode(200)
  @ApiOperation({ summary: '계좌 예금주 확인 및 accountVerifyToken 발급' })
  verifyAccount(@Body() body: VerifyAccountDto) {
    return this.authService.verifyAccount(body);
  }

  @Post('signup')
  @HttpCode(201)
  @ApiOperation({ summary: '회원가입 (단일 트랜잭션)' })
  signup(@Body() body: SignupDto) {
    return this.authService.signup(body);
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
}
