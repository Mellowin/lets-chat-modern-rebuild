import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspacesController } from './workspaces.controller';

@Module({
  imports: [AuthModule, UsersModule, AuditModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository],
  exports: [WorkspacesService, WorkspacesRepository],
})
export class WorkspacesModule {}
