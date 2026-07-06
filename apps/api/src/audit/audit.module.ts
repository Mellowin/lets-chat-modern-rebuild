import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditRepository } from './audit.repository';
import { AuditLogController } from './audit-log.controller';

@Global()
@Module({
  controllers: [AuditLogController],
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
