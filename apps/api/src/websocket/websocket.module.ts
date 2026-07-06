import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ChannelsModule } from '../channels/channels.module';
import { DirectConversationsModule } from '../direct-conversations/direct-conversations.module';
import { GroupsModule } from '../groups/groups.module';
import { WebsocketGateway } from './websocket.gateway';
import { WebsocketEventsService } from './websocket-events.service';
import { PresenceService } from './presence.service';
import { WebsocketRedisAdapterService } from './websocket-redis-adapter.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    ChannelsModule,
    forwardRef(() => DirectConversationsModule),
    forwardRef(() => GroupsModule),
  ],
  providers: [
    WebsocketGateway,
    WebsocketEventsService,
    PresenceService,
    WebsocketRedisAdapterService,
  ],
  exports: [
    WebsocketEventsService,
    PresenceService,
    WebsocketRedisAdapterService,
  ],
})
export class WebsocketModule {}
