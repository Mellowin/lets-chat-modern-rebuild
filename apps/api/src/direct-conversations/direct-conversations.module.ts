import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PushModule } from '../push/push.module';
import { SafetyModule } from '../safety/safety.module';
import { MentionsService } from '../common/mentions.service';
import { AttachmentsModule } from '../messages/attachments.module';
import { StorageModule } from '../storage/storage.module';
import { DirectConversationsService } from './direct-conversations.service';
import { DirectConversationsRepository } from './direct-conversations.repository';
import { DirectConversationsController } from './direct-conversations.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => WebsocketModule),
    PushModule,
    SafetyModule,
    AttachmentsModule,
    StorageModule,
  ],
  controllers: [DirectConversationsController],
  providers: [
    DirectConversationsService,
    DirectConversationsRepository,
    MentionsService,
  ],
  exports: [DirectConversationsService, DirectConversationsRepository],
})
export class DirectConversationsModule {}
