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

@Module({
  imports: [AuthModule, UsersModule, WorkspacesModule, ChannelsModule],
  controllers: [MessagesController, ReactionsController, ReadReceiptsController],
  providers: [MessagesService, MessagesRepository, ReactionsService, ReactionsRepository, ReadReceiptsService, ReadReceiptsRepository],
  exports: [MessagesService, MessagesRepository, ReactionsService, ReactionsRepository, ReadReceiptsService, ReadReceiptsRepository],
})
export class MessagesModule {}
