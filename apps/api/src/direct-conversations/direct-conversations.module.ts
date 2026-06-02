import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { DirectConversationsService } from './direct-conversations.service';
import { DirectConversationsRepository } from './direct-conversations.repository';
import { DirectConversationsController } from './direct-conversations.controller';

@Module({
  imports: [AuthModule, UsersModule, WebsocketModule],
  controllers: [DirectConversationsController],
  providers: [DirectConversationsService, DirectConversationsRepository],
  exports: [DirectConversationsService, DirectConversationsRepository],
})
export class DirectConversationsModule {}
