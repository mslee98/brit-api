import {
  Controller,
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

import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ActiveAdminGuard } from '../admins/guards/active-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/domain/enums/user-role.enum';
import { CoinService } from './coin.service';
import { CoinWalletResponseDto } from './dto/coin-response.dto';

/**
 * Brit Coin 구매 완료 처리.
 * Payment Module 도입 전 P0용 Admin 확정 API.
 */
@ApiTags('admin-coin-purchases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ActiveAdminGuard)
@Roles(UserRole.ADMIN, UserRole.SYS_ADMIN)
@Controller('admin/coin-purchases')
export class AdminCoinPurchaseController {
  constructor(private readonly coinService: CoinService) {}

  @Post(':purchaseId/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Brit Coin 구매 완료 처리 (이미 완료 시 409)' })
  @ApiOkResponse({ type: CoinWalletResponseDto })
  complete(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
  ): Promise<CoinWalletResponseDto> {
    return this.coinService.completeCoinPurchase(purchaseId, admin.userId);
  }
}
