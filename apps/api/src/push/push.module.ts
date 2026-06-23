import { Module } from '@nestjs/common';
import { DatabaseModule } from '@lets-chat/database';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PushRepository } from './push.repository';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule],
  controllers: [PushController],
  providers: [PushService, PushRepository],
  exports: [PushService],
})
export class PushModule {}
