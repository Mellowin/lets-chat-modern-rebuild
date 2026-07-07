import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PushModule } from '../push/push.module';
import { SafetyModule } from '../safety/safety.module';
import { MentionsService } from '../common/mentions.service';
import { AttachmentsModule } from '../messages/attachments.module';
import { StorageModule } from '../storage/storage.module';
import { GroupsController } from './groups.controller';
import { GroupInvitesController } from './group-invites.controller';
import { GroupsService } from './groups.service';
import { GroupInvitesService } from './group-invites.service';
import { GroupsRepository } from './groups.repository';
import { GroupInvitesRepository } from './group-invites.repository';

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
  controllers: [GroupsController, GroupInvitesController],
  providers: [
    GroupsService,
    GroupInvitesService,
    GroupsRepository,
    GroupInvitesRepository,
    MentionsService,
  ],
  exports: [GroupsService, GroupsRepository, GroupInvitesService],
})
export class GroupsModule {}
