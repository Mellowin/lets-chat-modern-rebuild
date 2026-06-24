import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { DirectConversationsModule } from '../direct-conversations/direct-conversations.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactsRepository } from './contacts.repository';

@Module({
  imports: [UsersModule, DirectConversationsModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsRepository],
  exports: [ContactsService, ContactsRepository],
})
export class ContactsModule {}
