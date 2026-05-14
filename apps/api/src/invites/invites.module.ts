import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { InvitesController } from './invites.controller';
import { InvitesAcceptController } from './invites-accept.controller';
import { InvitesService } from './invites.service';
import { InvitesRepository } from './invites.repository';

@Module({
  imports: [AuthModule, UsersModule, WorkspacesModule],
  controllers: [InvitesController, InvitesAcceptController],
  providers: [InvitesService, InvitesRepository],
})
export class InvitesModule {}
