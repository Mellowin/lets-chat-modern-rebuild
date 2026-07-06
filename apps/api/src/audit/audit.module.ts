import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';
import { AuditLogController } from './audit-log.controller';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [AuditLogController],
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
