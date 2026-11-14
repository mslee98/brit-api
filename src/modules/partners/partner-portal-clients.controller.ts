import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { resolveClientIp } from '../../common/utils/client-ip.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreatePortalPartnerClientDto,
  UpdatePortalPartnerClientDto,
} from './dto/portal-partner-client.dto';
import {
  PartnerMemberGuard,
  type PartnerPortalRequest,
} from './guards/partner-member.guard';
import {
  PartnerClientsService,
  type PartnerPortalActor,
} from './partner-clients.service';

type PortalHttpRequest = Request & PartnerPortalRequest;

@ApiTags('partner-portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PartnerMemberGuard)
@Controller('partner/clients')
export class PartnerPortalClientsController {
  constructor(private readonly partnerClientsService: PartnerClientsService) {}

  @Get()
  @ApiOperation({ summary: '내 업체 연동 키(Client) 목록' })
  list(@Req() req: PortalHttpRequest) {
    return this.partnerClientsService.listClients(req.partnerId!);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Sandbox 연동 키 발급 (OWNER, SERVER면 비밀키 원문 한 번 반환)',
  })
  create(
    @Req() req: PortalHttpRequest,
    @Body() body: CreatePortalPartnerClientDto,
  ) {
    return this.partnerClientsService.createPortalClient(
      toActor(req),
      body,
      resolveClientIp(req),
    );
  }

  @Patch(':partnerClientId')
  @ApiOperation({ summary: 'Sandbox 연동 키 이름·허용 Origin 수정 (OWNER)' })
  update(
    @Req() req: PortalHttpRequest,
    @Param('partnerClientId', ParseUUIDPipe) partnerClientId: string,
    @Body() body: UpdatePortalPartnerClientDto,
  ) {
    return this.partnerClientsService.updatePortalClient(
      toActor(req),
      partnerClientId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':partnerClientId/rotate-secret')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Sandbox 서버용 비밀키 재발급 (OWNER, 원문 한 번 반환)',
  })
  rotateSecret(
    @Req() req: PortalHttpRequest,
    @Param('partnerClientId', ParseUUIDPipe) partnerClientId: string,
  ) {
    return this.partnerClientsService.rotatePortalClientSecret(
      toActor(req),
      partnerClientId,
      resolveClientIp(req),
    );
  }
}

function toActor(req: PortalHttpRequest): PartnerPortalActor {
  return {
    userId: req.user!.userId,
    partnerId: req.partnerId!,
    memberRole: req.partnerMemberRole!,
  };
}
