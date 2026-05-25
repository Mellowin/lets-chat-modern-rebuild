import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspacesController } from './workspaces.controller';
import { ChannelsRepository } from '../channels/channels.repository';
import { ChannelInvitesRepository } from '../channel-invites/channel-invites.repository';

@Module({
  imports: [AuthModule, UsersModule, AuditModule],
  controllers: [WorkspacesController],
  providers: [
    WorkspacesService,
    WorkspacesRepository,
    ChannelsRepository,
    ChannelInvitesRepository,
  ],
  exports: [WorkspacesService, WorkspacesRepository],
})
export class WorkspacesModule {}
