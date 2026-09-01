import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AcceptTradeRequestResponseDto,
  RejectTradeRequestDto,
  TradeRequestResponseDto,
} from './dto/matching-response.dto';
import { MatchingService } from './matching.service';

@ApiTags('trade-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trade-requests')
export class TradeRequestController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get(':id')
  @ApiOperation({ summary: '거래 신청 상세 (구매자·판매자만)' })
  @ApiOkResponse({ type: TradeRequestResponseDto })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TradeRequestResponseDto> {
    return this.matchingService.getTradeRequest(user.userId, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: '판매자 수락 — Trade 생성 (재차감 없음)' })
  @ApiOkResponse({ type: AcceptTradeRequestResponseDto })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AcceptTradeRequestResponseDto> {
    return this.matchingService.acceptTradeRequest(user.userId, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: '판매자 거절 — Reservation 해제' })
  @ApiOkResponse({ type: TradeRequestResponseDto })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTradeRequestDto,
  ): Promise<TradeRequestResponseDto> {
    return this.matchingService.rejectTradeRequest(
      user.userId,
      id,
      dto.reasonCode,
    );
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '구매자 철회 — Reservation 해제' })
  @ApiOkResponse({ type: TradeRequestResponseDto })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TradeRequestResponseDto> {
    return this.matchingService.cancelTradeRequest(user.userId, id);
  }
}
