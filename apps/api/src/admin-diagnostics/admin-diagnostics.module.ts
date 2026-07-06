import { Module } from '@nestjs/common';
import { AdminDiagnosticsController } from './admin-diagnostics.controller';
import { AdminDiagnosticsService } from './admin-diagnostics.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule],
  controllers: [AdminDiagnosticsController],
  providers: [AdminDiagnosticsService],
})
export class AdminDiagnosticsModule {}
