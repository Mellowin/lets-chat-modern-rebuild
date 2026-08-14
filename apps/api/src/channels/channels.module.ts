import { Module } from '@nestjs/common';
import { AuthCommonModule } from '../auth/auth-common.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesRepositoryModule } from '../workspaces/workspaces-repository.module';
import { ChannelsService } from './channels.service';
import { ChannelsRepository } from './channels.repository';
import { ChannelsController } from './channels.controller';

@Module({
  imports: [AuthCommonModule, UsersModule, WorkspacesRepositoryModule],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChannelsRepository],
  exports: [ChannelsService, ChannelsRepository],
})
export class ChannelsModule {}
