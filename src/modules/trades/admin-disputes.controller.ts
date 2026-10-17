import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { resolveClientIp } from '../../common/utils/client-ip.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AdminAccessService } from '../admins/admin-access.service';
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { AdminAssignDisputeDto } from './dto/admin-trade-command.dto';
import {
  AdminDisputeDetailDto,
  AdminDisputeListItemDto,
} from './dto/admin-dispute-response.dto';
import {
  AdminCreateDisputeMessageDto,
  AdminDisputeMessageDto,
  AdminDisputeMessageListDto,
  SearchDisputeMessagesDto,
} from './dto/dispute-message.dto';
import { SearchAdminDisputesDto } from './dto/search-trades.dto';
import { DisputeMacroListDto } from './dto/dispute-macro.dto';
import { DISPUTE_MACROS } from './domain/constants/dispute-macros';
import { DISPUTE_EVIDENCE_MAX_BYTES } from './domain/constants/trade.constants';
import { TradeService } from './trade.service';

@ApiTags('admin-disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(
    private readonly tradeService: TradeService,
    private readonly adminAccessService: AdminAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: '관리자 분쟁 큐' })
  @ApiOkResponse({ type: [AdminDisputeListItemDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchAdminDisputesDto,
  ) {
    return this.tradeService.listAdminDisputes(query, user.userId);
  }

  @Get('macros')
  @ApiOperation({ summary: 'CS 채팅 매크로 목록' })
  @ApiOkResponse({ type: DisputeMacroListDto })
  listMacros(): DisputeMacroListDto {
    return { items: DISPUTE_MACROS };
  }

  @Get(':disputeId/messages')
  @ApiOperation({ summary: '분쟁 채팅·내부메모 목록' })
  @ApiOkResponse({ type: AdminDisputeMessageListDto })
  listMessages(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Query() query: SearchDisputeMessagesDto,
  ): Promise<AdminDisputeMessageListDto> {
    return this.tradeService.listAdminDisputeMessages(disputeId, query);
  }

  @Post(':disputeId/messages')
  @ApiOperation({ summary: '분쟁 공개 메시지 또는 내부 메모' })
  @ApiCreatedResponse({ type: AdminDisputeMessageDto })
  createMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() dto: AdminCreateDisputeMessageDto,
  ): Promise<AdminDisputeMessageDto> {
    return this.tradeService.postAdminDisputeMessage(
      user.userId,
      disputeId,
      dto.body,
      dto.isInternal === true,
    );
  }

  @Post(':disputeId/evidence')
  @ApiOperation({ summary: '분쟁 이미지 증빙 첨부 (관리자)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: AdminDisputeMessageDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DISPUTE_EVIDENCE_MAX_BYTES },
    }),
  )
  createEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AdminDisputeMessageDto> {
    return this.tradeService.postAdminDisputeEvidence(
      user.userId,
      disputeId,
      file,
    );
  }

  @Get(':disputeId')
  @ApiOperation({ summary: '관리자 분쟁 상세' })
  @ApiOkResponse({ type: AdminDisputeDetailDto })
  getOne(
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
  ): Promise<AdminDisputeDetailDto> {
    return this.tradeService.getAdminDispute(disputeId);
  }

  @Post(':disputeId/assign')
  @HttpCode(200)
  @ApiOperation({ summary: '분쟁 배정 (본인 수령. 타인 지정은 리더/SYS_ADMIN)' })
  @ApiOkResponse({ type: AdminDisputeDetailDto })
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() dto: AdminAssignDisputeDto,
    @Req() req: Request,
  ): Promise<AdminDisputeDetailDto> {
    const assigneeUserId = dto.adminUserId ?? user.userId;
    if (assigneeUserId !== user.userId) {
      await this.adminAccessService.assertIsLeaderOrSysAdmin(user);
      await this.adminAccessService.assertActiveAdmin(assigneeUserId);
    }
    return this.tradeService.assignDispute(
      user.userId,
      disputeId,
      assigneeUserId,
      resolveClientIp(req),
    );
  }

  @Post(':disputeId/takeover')
  @HttpCode(200)
  @ApiOperation({ summary: '분쟁 인수 (리더/SYS_ADMIN)' })
  @ApiOkResponse({ type: AdminDisputeDetailDto })
  async takeover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Req() req: Request,
  ): Promise<AdminDisputeDetailDto> {
    await this.adminAccessService.assertIsLeaderOrSysAdmin(user);
    return this.tradeService.takeoverDispute(
      user.userId,
      disputeId,
      resolveClientIp(req),
    );
  }
}
