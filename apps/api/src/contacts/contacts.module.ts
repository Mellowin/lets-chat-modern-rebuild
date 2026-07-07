import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DirectConversationsModule } from '../direct-conversations/direct-conversations.module';
import { SafetyModule } from '../safety/safety.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactsRepository } from './contacts.repository';
import { ContactRequestsRepository } from './contact-requests.repository';

@Module({
  imports: [AuthModule, UsersModule, DirectConversationsModule, SafetyModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsRepository, ContactRequestsRepository],
  exports: [ContactsService, ContactsRepository],
})
export class ContactsModule {}
