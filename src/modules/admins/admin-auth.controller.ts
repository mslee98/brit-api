import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { resolveClientIp } from '../../common/utils/client-ip.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminLogoutDto } from './dto/admin-logout.dto';
import { ActiveAdminGuard } from './guards/active-admin.guard';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '관리자 로그인' })
  login(@Body() body: AdminLoginDto, @Req() req: Request) {
    return this.adminAuthService.login(body, {
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: resolveClientIp(req),
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: '관리자 토큰 갱신 (Refresh Rotation)' })
  refresh(@Body() body: RefreshTokenDto) {
    return this.adminAuthService.refresh(body);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({
    summary: '관리자 로그아웃 (Bearer 또는 refreshToken body)',
  })
  async logout(
    @Body() body: AdminLogoutDto,
    @Req() req: Request,
  ): Promise<void> {
    const sessionId = await this.tryResolveSessionId(req);
    await this.adminAuthService.logout({
      sessionId,
      refreshToken: body.refreshToken,
    });
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
  @Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '관리자 내 정보' })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.adminAuthService.getMe(user.userId);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
  @Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '본인 세션 목록' })
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    const items = await this.adminAuthService.listSessions(
      user.userId,
      user.sessionId,
    );
    return { items };
  }

  @Delete('sessions/others')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
  @Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '현재 세션 제외 전체 종료' })
  async revokeOthers(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.adminAuthService.revokeOtherSessions(
      user.userId,
      user.sessionId,
    );
  }

  @Delete('sessions/:sessionId')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
  @Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '본인 특정 세션 종료' })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.adminAuthService.revokeSession(user.userId, sessionId);
  }

  @Delete('sessions')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
  @Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '본인 전체 세션 종료' })
  async revokeAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.adminAuthService.revokeAllSessions(user.userId);
  }

  private async tryResolveSessionId(req: Request): Promise<string | undefined> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }
    try {
      const payload = await this.jwtService.verifyAsync<{ sid?: string }>(
        header.slice('Bearer '.length),
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );
      return payload.sid;
    } catch {
      return undefined;
    }
  }
}
