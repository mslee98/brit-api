import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';

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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login-id/check')
  @HttpCode(200)
  checkLoginId(@Body() body: CheckLoginIdDto) {
    return this.authService.checkLoginId(body);
  }

  @Post('nickname/check')
  @HttpCode(200)
  checkNickname(@Body() body: CheckNicknameDto) {
    return this.authService.checkNickname(body);
  }

  @Post('accounts/verify')
  @HttpCode(200)
  verifyAccount(@Body() body: VerifyAccountDto) {
    return this.authService.verifyAccount(body);
  }

  @Post('signup')
  @HttpCode(201)
  signup(@Body() body: SignupDto) {
    return this.authService.signup(body);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('token/refresh')
  @HttpCode(200)
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user.sessionId);
  }
}
