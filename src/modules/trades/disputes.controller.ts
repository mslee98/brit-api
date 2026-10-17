import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateDisputeMessageDto,
  PartyDisputeDetailDto,
  PartyDisputeMessageDto,
  PartyDisputeMessageListDto,
  SearchDisputeMessagesDto,
} from './dto/dispute-message.dto';
import { TradeService } from './trade.service';

@ApiTags('disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly tradeService: TradeService) {}

  @Get(':disputeId/messages')
  @ApiOperation({ summary: '분쟁 채팅 목록 (당사자, 내부메모 숨김)' })
  @ApiOkResponse({ type: PartyDisputeMessageListDto })
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Query() query: SearchDisputeMessagesDto,
  ): Promise<PartyDisputeMessageListDto> {
    return this.tradeService.listPartyDisputeMessages(
      user.userId,
      disputeId,
      query,
    );
  }

  @Post(':disputeId/messages')
  @ApiOperation({ summary: '분쟁 채팅 메시지 전송 (당사자)' })
  @ApiCreatedResponse({ type: PartyDisputeMessageDto })
  createMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() dto: CreateDisputeMessageDto,
  ): Promise<PartyDisputeMessageDto> {
    return this.tradeService.postPartyDisputeMessage(
      user.userId,
      disputeId,
      dto.body,
    );
  }

  @Get(':disputeId')
  @ApiOperation({ summary: '분쟁 채팅방 요약 (당사자)' })
  @ApiOkResponse({ type: PartyDisputeDetailDto })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
  ): Promise<PartyDisputeDetailDto> {
    return this.tradeService.getMyDispute(user.userId, disputeId);
  }
}
