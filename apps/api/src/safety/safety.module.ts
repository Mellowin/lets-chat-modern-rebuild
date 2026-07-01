import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DatabaseModule } from '@lets-chat/database';
import { BlocksController } from './blocks.controller';
import { ReportsController } from './reports.controller';
import { AdminReportsController } from './admin-reports.controller';
import { BlocksService } from './blocks.service';
import { ReportsService } from './reports.service';
import { AdminReportsService } from './admin-reports.service';
import { BlocksRepository } from './blocks.repository';
import { ReportsRepository } from './reports.repository';
import { AdminReportsRepository } from './admin-reports.repository';

@Module({
  imports: [AuthModule, UsersModule, DatabaseModule],
  controllers: [BlocksController, ReportsController, AdminReportsController],
  providers: [
    BlocksService,
    ReportsService,
    AdminReportsService,
    BlocksRepository,
    ReportsRepository,
    AdminReportsRepository,
  ],
  exports: [BlocksService, BlocksRepository],
})
export class SafetyModule {}
