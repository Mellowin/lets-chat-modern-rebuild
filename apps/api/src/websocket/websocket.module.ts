import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ChannelsModule } from '../channels/channels.module';
import { WebsocketGateway } from './websocket.gateway';

@Module({
  imports: [AuthModule, UsersModule, ChannelsModule],
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
