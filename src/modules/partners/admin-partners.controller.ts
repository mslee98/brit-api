import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { AssignPartnerMemberDto } from './dto/assign-partner-member.dto';
import { CreatePartnerClientDto } from './dto/create-partner-client.dto';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { CreatePartnerFeePolicyDto } from './dto/create-partner-fee-policy.dto';
import {
  CreatePartnerAssetDto,
  CreateUserPartnerLinkDto,
} from './dto/partner-exchange-request.dto';
import { PartnerClientActionDto } from './dto/partner-client-action.dto';
import { PartnerFeePolicyActionDto } from './dto/partner-fee-policy-action.dto';
import { PartnerStatusActionDto } from './dto/partner-status-action.dto';
import { RemovePartnerMemberDto } from './dto/remove-partner-member.dto';
import { SearchAdminPartnersDto } from './dto/search-admin-partners.dto';
import { UpdatePartnerClientDto } from './dto/update-partner-client.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { UpdatePartnerMemberDto } from './dto/update-partner-member.dto';
import { PartnerClientsService } from './partner-clients.service';
import { PartnerExchangeService } from './partner-exchange.service';
import { PartnerFeePoliciesService } from './partner-fee-policies.service';
import { PartnerMembersService } from './partner-members.service';
import { PartnerPortalService } from './partner-portal.service';
import { PartnersService } from './partners.service';

@ApiTags('admin-partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/partners')
export class AdminPartnersController {
  constructor(
    private readonly partnersService: PartnersService,
    private readonly partnerMembersService: PartnerMembersService,
    private readonly partnerClientsService: PartnerClientsService,
    private readonly partnerFeePoliciesService: PartnerFeePoliciesService,
    private readonly partnerExchangeService: PartnerExchangeService,
    private readonly partnerPortalService: PartnerPortalService,
  ) {}

  @Get()
  @ApiOperation({ summary: '업체 목록' })
  search(@Query() query: SearchAdminPartnersDto) {
    return this.partnersService.searchAdmin(query);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: '업체 등록 (즉시 ACTIVE)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePartnerDto,
    @Req() req: Request,
  ) {
    return this.partnersService.createPartner(
      user.userId,
      body,
      resolveClientIp(req),
    );
  }

  @Get(':partnerId')
  @ApiOperation({ summary: '업체 상세' })
  getDetail(@Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.partnersService.findAdminDetail(partnerId);
  }

  @Get(':partnerId/dashboard')
  @ApiOperation({
    summary: '업체 운영 요약 (수수료·오늘 전환)',
  })
  getDashboard(@Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.partnerPortalService.getDashboard(partnerId);
  }

  @Patch(':partnerId')
  @ApiOperation({ summary: '업체 정보 수정 (code 변경 불가)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: UpdatePartnerDto,
    @Req() req: Request,
  ) {
    return this.partnersService.updatePartner(
      user.userId,
      partnerId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':partnerId/suspend')
  @HttpCode(204)
  @ApiOperation({ summary: '업체 중지' })
  async suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: PartnerStatusActionDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.partnersService.suspendPartner(
      user.userId,
      partnerId,
      body.reason,
      resolveClientIp(req),
    );
  }

  @Post(':partnerId/resume')
  @HttpCode(204)
  @ApiOperation({ summary: '업체 재개 (SUSPENDED → ACTIVE)' })
  async resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: PartnerStatusActionDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.partnersService.resumePartner(
      user.userId,
      partnerId,
      body.reason,
      resolveClientIp(req),
    );
  }

  @Post(':partnerId/terminate')
  @HttpCode(204)
  @ApiOperation({ summary: '업체 종료' })
  async terminate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: PartnerStatusActionDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.partnersService.terminatePartner(
      user.userId,
      partnerId,
      body.reason,
      resolveClientIp(req),
    );
  }

  @Get(':partnerId/members')
  @ApiOperation({ summary: '업체 담당자 목록' })
  listMembers(@Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.partnerMembersService.listMembers(partnerId);
  }

  @Post(':partnerId/members')
  @HttpCode(201)
  @ApiOperation({ summary: '업체 담당자 신규 연결' })
  assignMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: AssignPartnerMemberDto,
    @Req() req: Request,
  ) {
    return this.partnerMembersService.assignMember(
      user.userId,
      partnerId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':partnerId/members/reassign')
  @HttpCode(201)
  @ApiOperation({ summary: '업체 담당자 재배정 (타 업체 → 이 업체)' })
  reassignMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: AssignPartnerMemberDto,
    @Req() req: Request,
  ) {
    return this.partnerMembersService.reassignMember(
      user.userId,
      partnerId,
      body,
      resolveClientIp(req),
    );
  }

  @Patch(':partnerId/members/:memberId')
  @ApiOperation({ summary: '업체 담당자 역할 변경' })
  updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: UpdatePartnerMemberDto,
    @Req() req: Request,
  ) {
    return this.partnerMembersService.updateMemberRole(
      user.userId,
      partnerId,
      memberId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':partnerId/members/:memberId/remove')
  @HttpCode(204)
  @ApiOperation({ summary: '업체 담당자 해제' })
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: RemovePartnerMemberDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.partnerMembersService.removeMember(
      user.userId,
      partnerId,
      memberId,
      body.reason,
      resolveClientIp(req),
    );
  }

  @Post(':partnerId/assets')
  @HttpCode(201)
  @ApiOperation({ summary: '업체 자산(포인트) 등록' })
  createAsset(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: CreatePartnerAssetDto,
  ) {
    return this.partnerExchangeService.createAsset(partnerId, body);
  }

  @Post(':partnerId/user-links')
  @HttpCode(201)
  @ApiOperation({ summary: '최종 사용자 ↔ 업체 회원 키 연결' })
  createUserLink(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: CreateUserPartnerLinkDto,
  ) {
    return this.partnerExchangeService.linkUser(partnerId, body);
  }

  @Get(':partnerId/fee-policies')
  @ApiOperation({ summary: '업체 수수료 정책 목록' })
  listFeePolicies(@Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.partnerFeePoliciesService.listForPartner(partnerId);
  }

  @Post(':partnerId/fee-policies')
  @HttpCode(201)
  @ApiOperation({ summary: '업체 수수료 정책 등록' })
  createFeePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: CreatePartnerFeePolicyDto,
    @Req() req: Request,
  ) {
    return this.partnerFeePoliciesService.create(
      user.userId,
      partnerId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':partnerId/fee-policies/:policyId/deactivate')
  @ApiOperation({ summary: '업체 수수료 정책 비활성' })
  deactivateFeePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('policyId', ParseUUIDPipe) policyId: string,
    @Body() body: PartnerFeePolicyActionDto,
    @Req() req: Request,
  ) {
    return this.partnerFeePoliciesService.deactivate(
      user.userId,
      partnerId,
      policyId,
      body.reason,
      resolveClientIp(req),
    );
  }

  @Get(':partnerId/clients')
  @ApiOperation({ summary: '업체 Client 목록' })
  listClients(@Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.partnerClientsService.listClients(partnerId);
  }

  @Post(':partnerId/clients')
  @HttpCode(201)
  @ApiOperation({
    summary: '업체 Client 발급 (SERVER면 API Secret 원문을 한 번만 반환)',
  })
  createClient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() body: CreatePartnerClientDto,
    @Req() req: Request,
  ) {
    return this.partnerClientsService.createClient(
      user.userId,
      partnerId,
      body,
      resolveClientIp(req),
    );
  }

  @Get(':partnerId/clients/:partnerClientId')
  @ApiOperation({ summary: '업체 Client 상세' })
  getClient(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('partnerClientId', ParseUUIDPipe) partnerClientId: string,
  ) {
    return this.partnerClientsService.getClient(partnerId, partnerClientId);
  }

  @Patch(':partnerId/clients/:partnerClientId')
  @ApiOperation({ summary: '업체 Client 수정 (name·webhook·scopes·origins)' })
  updateClient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('partnerClientId', ParseUUIDPipe) partnerClientId: string,
    @Body() body: UpdatePartnerClientDto,
    @Req() req: Request,
  ) {
    return this.partnerClientsService.updateClient(
      user.userId,
      partnerId,
      partnerClientId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':partnerId/clients/:partnerClientId/rotate-secret')
  @HttpCode(201)
  @ApiOperation({ summary: 'API Secret 회전 (원문 한 번만 반환)' })
  rotateSecret(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('partnerClientId', ParseUUIDPipe) partnerClientId: string,
    @Body() body: PartnerClientActionDto,
    @Req() req: Request,
  ) {
    return this.partnerClientsService.rotateApiSecret(
      user.userId,
      partnerId,
      partnerClientId,
      body.reason,
      resolveClientIp(req),
    );
  }

  @Post(':partnerId/clients/:partnerClientId/revoke')
  @HttpCode(204)
  @ApiOperation({ summary: '업체 Client 폐기' })
  async revokeClient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('partnerClientId', ParseUUIDPipe) partnerClientId: string,
    @Body() body: PartnerClientActionDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.partnerClientsService.revokeClient(
      user.userId,
      partnerId,
      partnerClientId,
      body.reason,
      resolveClientIp(req),
    );
  }
}
