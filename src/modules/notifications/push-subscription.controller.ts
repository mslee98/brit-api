import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dto/create-push-subscription.dto';
import { NotificationDomainException } from './exceptions/notification.exceptions';
import { NotificationService } from './notification.service';
import { PushSubscriptionService } from './push-subscription.service';

@ApiTags('me-push')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/push')
export class PushSubscriptionController {
  constructor(
    private readonly pushSubscriptionService: PushSubscriptionService,
    private readonly notificationService: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  @Get('vapid-public-key')
  @ApiOperation({ summary: 'Web Push VAPID 공개키' })
  getVapidPublicKey() {
    return this.pushSubscriptionService.getVapidPublicKey();
  }

  @Post('subscriptions')
  @ApiOperation({ summary: 'Web Push 구독 등록' })
  createSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePushSubscriptionDto,
    @Req() request: Request,
  ) {
    const userAgentHeader = request.headers['user-agent'];
    const userAgent =
      typeof userAgentHeader === 'string' ? userAgentHeader.slice(0, 512) : null;
    return this.pushSubscriptionService.upsertSubscription({
      userId: user.userId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent,
    });
  }

  @Delete('subscriptions')
  @HttpCode(204)
  @ApiOperation({ summary: 'Web Push 구독 해제' })
  async deleteSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeletePushSubscriptionDto,
  ): Promise<void> {
    await this.pushSubscriptionService.deleteByEndpoint(
      user.userId,
      dto.endpoint,
    );
  }

  @Post('test')
  @ApiOperation({ summary: 'DEV: 현재 사용자에게 테스트 Web Push' })
  sendTestPush(@CurrentUser() user: AuthenticatedUser) {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw NotificationDomainException.pushTestNotAllowed();
    }
    return this.notificationService.enqueueDevTestPush(user.userId);
  }
}
