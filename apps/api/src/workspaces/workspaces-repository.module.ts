import { Module } from '@nestjs/common';
import { WorkspacesRepository } from './workspaces.repository';

@Module({
  providers: [WorkspacesRepository],
  exports: [WorkspacesRepository],
})
export class WorkspacesRepositoryModule {}
