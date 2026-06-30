import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DatabaseModule } from '@lets-chat/database';
import { BlocksController } from './blocks.controller';
import { ReportsController } from './reports.controller';
import { BlocksService } from './blocks.service';
import { ReportsService } from './reports.service';
import { BlocksRepository } from './blocks.repository';
import { ReportsRepository } from './reports.repository';

@Module({
  imports: [AuthModule, UsersModule, DatabaseModule],
  controllers: [BlocksController, ReportsController],
  providers: [
    BlocksService,
    ReportsService,
    BlocksRepository,
    ReportsRepository,
  ],
  exports: [BlocksService, BlocksRepository],
})
export class SafetyModule {}
