import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PartnerLinkSessionsService } from './partner-link-sessions.service';

/**
 * BRIT 연결 팝업(brit-front /embed.html)에서 로그인한 사용자가 호출한다.
 */
@ApiTags('embed-link-sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('embed/link-sessions')
export class EmbedLinkSessionsController {
  constructor(private readonly linkSessionsService: PartnerLinkSessionsService) {}

  @Post(':token/claim')
  @HttpCode(200)
  @ApiOperation({
    summary: 'MC-P9 — 팝업에서 BRIT 계정 claim + 표시용 연결 코드',
  })
  claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ) {
    return this.linkSessionsService.claim(token, user.userId);
  }

  @Get(':token')
  @ApiOperation({
    summary: '연결 요청 조회 (claim 후 pairingCode·linkState)',
  })
  get(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.linkSessionsService.getForUser(token, user.userId);
  }

  @Sse(':token/events')
  @ApiOperation({
    summary: 'MC-P9 — 승인 대기 SSE (link_session 이벤트)',
  })
  @ApiProduces('text/event-stream')
  events(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ): Observable<MessageEvent> {
    return this.linkSessionsService.subscribeWaitEvents(token, user.userId);
  }

  @Get(':token/wait')
  @ApiOperation({
    summary: 'MC-P9 — 승인 대기 상태 1회 조회 (SSE 폴백)',
  })
  wait(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.linkSessionsService.waitForResult(token, user.userId);
  }

  @Post(':token/consent')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ALREADY_LINKED_SAME 빠른 동의 (OTP 없음). NEW는 클라이언트 승인',
  })
  consent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('token') token: string,
  ) {
    return this.linkSessionsService.consent(token, user.userId);
  }

  @Post(':token/reject')
  @HttpCode(200)
  @ApiOperation({ summary: '연결 거절 (팝업)' })
  reject(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.linkSessionsService.reject(token, user.userId);
  }
}
