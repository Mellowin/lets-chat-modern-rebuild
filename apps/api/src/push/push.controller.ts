import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PushService } from './push.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { UnsubscribePushDto } from './dto/unsubscribe-push.dto';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    const publicKey = this.pushService.getVapidPublicKey();
    if (!publicKey) {
      throw new ServiceUnavailableException(
        'Push notifications are not configured.',
      );
    }
    return { publicKey };
  }

  @Post('subscribe')
  @UseGuards(JwtAccessGuard)
  async subscribe(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePushSubscriptionDto,
  ) {
    await this.pushService.saveSubscription(userId, dto);
    return { success: true };
  }

  @Get('subscriptions')
  @UseGuards(JwtAccessGuard)
  async listSubscriptions(@CurrentUser('id') userId: string) {
    return this.pushService.listSubscriptions(userId);
  }

  @Post('unsubscribe')
  @UseGuards(JwtAccessGuard)
  async unsubscribe(
    @CurrentUser('id') userId: string,
    @Body() dto: UnsubscribePushDto,
  ) {
    await this.pushService.removeSubscription(userId, dto.endpoint);
    return { success: true };
  }

  @Delete('unsubscribe')
  @UseGuards(JwtAccessGuard)
  async unsubscribeDelete(
    @CurrentUser('id') userId: string,
    @Body() dto: UnsubscribePushDto,
  ) {
    await this.pushService.removeSubscription(userId, dto.endpoint);
    return { success: true };
  }
}
