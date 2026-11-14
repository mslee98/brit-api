import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('me-sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/sessions')
export class MeSessionsController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @ApiOperation({ summary: '내 ACTIVE 로그인 세션 목록 (기기·IP)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessionsForUser(user.userId, user.sessionId);
  }

  @Delete(':sessionId')
  @HttpCode(204)
  @ApiOperation({ summary: '특정 로그인 세션 종료' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.authService.revokeSessionForUser(user.userId, sessionId);
  }

  @Post('revoke-others')
  @HttpCode(204)
  @ApiOperation({ summary: '다른 기기 로그인만 모두 종료 (현재 세션 유지)' })
  async revokeOthers(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.revokeOtherSessionsForUser(
      user.userId,
      user.sessionId,
    );
  }
}
