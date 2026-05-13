import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ChannelsModule } from '../channels/channels.module';
import { WebsocketGateway } from './websocket.gateway';
import { WebsocketEventsService } from './websocket-events.service';

@Module({
  imports: [AuthModule, UsersModule, ChannelsModule],
  providers: [WebsocketGateway, WebsocketEventsService],
  exports: [WebsocketEventsService],
})
export class WebsocketModule {}
