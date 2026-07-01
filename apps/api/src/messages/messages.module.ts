import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ChannelsModule } from '../channels/channels.module';
import { MessagesService } from './messages.service';
import { MessagesRepository } from './messages.repository';
import { MessagesController } from './messages.controller';
import { ReactionsService } from './reactions.service';
import { ReactionsRepository } from './reactions.repository';
import { ReactionsController } from './reactions.controller';
import { ReadReceiptsService } from './read-receipts.service';
import { ReadReceiptsRepository } from './read-receipts.repository';
import { ReadReceiptsController } from './read-receipts.controller';
import { MessagesSearchService } from './messages-search.service';
import { SearchController } from './search.controller';
import { UserSearchController } from './user-search.controller';
import { StorageModule } from '../storage/storage.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PushModule } from '../push/push.module';
import { MentionsService } from '../common/mentions.service';
import { AttachmentsService } from './attachments.service';
import { AttachmentsRepository } from './attachments.repository';
import { AttachmentsController } from './attachments.controller';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    WorkspacesModule,
    ChannelsModule,
    StorageModule,
    WebsocketModule,
    PushModule,
  ],
  controllers: [
    MessagesController,
    ReactionsController,
    ReadReceiptsController,
    SearchController,
    UserSearchController,
    AttachmentsController,
  ],
  providers: [
    MessagesService,
    MessagesRepository,
    ReactionsService,
    ReactionsRepository,
    ReadReceiptsService,
    ReadReceiptsRepository,
    MessagesSearchService,
    AttachmentsService,
    AttachmentsRepository,
    MentionsService,
  ],
  exports: [
    MessagesService,
    MessagesRepository,
    ReactionsService,
    ReactionsRepository,
    ReadReceiptsService,
    ReadReceiptsRepository,
    MessagesSearchService,
    AttachmentsService,
    AttachmentsRepository,
  ],
})
export class MessagesModule {}
