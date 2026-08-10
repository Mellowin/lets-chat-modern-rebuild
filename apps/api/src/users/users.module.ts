import { Module, forwardRef } from '@nestjs/common';
import { AuthCommonModule } from '../auth/auth-common.module';
import { UsersRepository } from './users.repository';
import { UsersController } from './users.controller';

@Module({
  imports: [forwardRef(() => AuthCommonModule)],
  controllers: [UsersController],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
