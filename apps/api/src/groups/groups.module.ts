import { Module, forwardRef } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { PushModule } from '../push/push.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupsRepository } from './groups.repository';

@Module({
  imports: [UsersModule, forwardRef(() => WebsocketModule), PushModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupsRepository],
  exports: [GroupsService, GroupsRepository],
})
export class GroupsModule {}
