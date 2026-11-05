import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchPartnerExchangesDto } from './dto/search-partner-exchanges.dto';
import { SearchPartnerFeeAccrualsDto } from './dto/search-partner-fee-accruals.dto';
import {
  PartnerMemberGuard,
  type PartnerPortalRequest,
} from './guards/partner-member.guard';
import { PartnerPortalService } from './partner-portal.service';

@ApiTags('partner-portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PartnerMemberGuard)
@Controller('partner')
export class PartnerPortalController {
  constructor(private readonly partnerPortalService: PartnerPortalService) {}

  @Get('me')
  @ApiOperation({ summary: '내 업체 소속 정보' })
  me(@Req() req: PartnerPortalRequest) {
    return this.partnerPortalService.getMe(
      req.partnerId!,
      req.partnerMemberId!,
      req.partnerMemberRole!,
    );
  }

  @Get('dashboard')
  @ApiOperation({ summary: '대시보드 요약 (일일/누적 수수료·전환)' })
  dashboard(@Req() req: PartnerPortalRequest) {
    return this.partnerPortalService.getDashboard(req.partnerId!);
  }

  @Get('fee-policies')
  @ApiOperation({ summary: '수수료 정책 목록 (산정 근거)' })
  feePolicies(@Req() req: PartnerPortalRequest) {
    return this.partnerPortalService.listFeePolicies(req.partnerId!);
  }

  @Get('fee-accruals')
  @ApiOperation({ summary: '수수료 발생 내역' })
  feeAccruals(
    @Req() req: PartnerPortalRequest,
    @Query() query: SearchPartnerFeeAccrualsDto,
  ) {
    return this.partnerPortalService.listFeeAccruals(req.partnerId!, query);
  }

  @Get('exchanges')
  @ApiOperation({ summary: '충전·환전 내역' })
  exchanges(
    @Req() req: PartnerPortalRequest,
    @Query() query: SearchPartnerExchangesDto,
  ) {
    return this.partnerPortalService.listExchanges(req.partnerId!, query);
  }
}
