import { Module } from '@nestjs/common';
import { ChannelInvitesController } from './channel-invites.controller';
import { ChannelInvitesService } from './channel-invites.service';
import { ChannelInvitesRepository } from './channel-invites.repository';
import { ChannelsRepository } from '../channels/channels.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { UsersRepository } from '../users/users.repository';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [ChannelInvitesController],
  providers: [
    ChannelInvitesService,
    ChannelInvitesRepository,
    ChannelsRepository,
    WorkspacesRepository,
    UsersRepository,
  ],
})
export class ChannelInvitesModule {}
