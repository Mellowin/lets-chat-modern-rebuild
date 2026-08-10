import { Module, forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { AuthCommonModule } from './auth-common.module';
import { AuthController } from './auth.controller';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionFinalizerService } from './account-deletion-finalizer.service';
import { AccountDeletionIdempotencyService } from './account-deletion-idempotency.service';
import { DataExportService } from './data-export.service';

@Module({
  imports: [AuthCommonModule, forwardRef(() => UsersModule), MailModule],
  controllers: [AuthController],
  providers: [
    AccountDeletionService,
    AccountDeletionFinalizerService,
    AccountDeletionIdempotencyService,
    DataExportService,
  ],
  exports: [
    AuthCommonModule,
    AccountDeletionService,
    AccountDeletionFinalizerService,
    AccountDeletionIdempotencyService,
    DataExportService,
  ],
})
export class AuthModule {}
