import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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
import { BanksService } from './banks.service';
import { ActivateBankDto } from './dto/activate-bank.dto';
import { CreateBankDto } from './dto/create-bank.dto';
import { DeactivateBankDto } from './dto/deactivate-bank.dto';
import { SearchAdminBanksDto } from './dto/search-admin-banks.dto';
import { UpdateBankDto } from './dto/update-bank.dto';

@ApiTags('admin-banks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/banks')
export class AdminBanksController {
  constructor(private readonly banksService: BanksService) {}

  @Get()
  @ApiOperation({ summary: '은행 목록 (리더/SYS_ADMIN)' })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchAdminBanksDto,
  ) {
    return this.banksService.searchAdmin(user, query);
  }

  @Get(':bankId')
  @ApiOperation({ summary: '은행 상세 (리더/SYS_ADMIN)' })
  getDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bankId', ParseIntPipe) bankId: number,
  ) {
    return this.banksService.findAdminBankDetail(user, bankId);
  }

  @Post()
  @HttpCode(201)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '은행 등록' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateBankDto,
    @Req() req: Request,
  ) {
    return this.banksService.createBank(
      user.userId,
      body,
      resolveClientIp(req),
    );
  }

  @Patch(':bankId')
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '은행 수정 (code 변경 불가)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bankId', ParseIntPipe) bankId: number,
    @Body() body: UpdateBankDto,
    @Req() req: Request,
  ) {
    return this.banksService.updateBank(
      user.userId,
      bankId,
      body,
      resolveClientIp(req),
    );
  }

  @Post(':bankId/activate')
  @HttpCode(204)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '은행 활성화' })
  async activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bankId', ParseIntPipe) bankId: number,
    @Body() body: ActivateBankDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.banksService.setBankActive(
      user.userId,
      bankId,
      true,
      body.reason,
      resolveClientIp(req),
    );
  }

  @Post(':bankId/deactivate')
  @HttpCode(204)
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: '은행 비활성화' })
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bankId', ParseIntPipe) bankId: number,
    @Body() body: DeactivateBankDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.banksService.setBankActive(
      user.userId,
      bankId,
      false,
      body.reason,
      resolveClientIp(req),
    );
  }
}
