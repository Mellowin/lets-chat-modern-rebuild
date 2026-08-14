import { Module } from '@nestjs/common';
import { AdminDiagnosticsController } from './admin-diagnostics.controller';
import { AdminDiagnosticsService } from './admin-diagnostics.service';
import { AuthCommonModule } from '../auth/auth-common.module';
import { UsersModule } from '../users/users.module';
import { PushModule } from '../push/push.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [AuthCommonModule, UsersModule, PushModule, WebsocketModule],
  controllers: [AdminDiagnosticsController],
  providers: [AdminDiagnosticsService],
})
export class AdminDiagnosticsModule {}
