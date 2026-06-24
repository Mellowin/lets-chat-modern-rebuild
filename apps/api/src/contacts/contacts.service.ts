import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { DirectConversationsService } from '../direct-conversations/direct-conversations.service';
import { ContactsRepository, ContactWithUser } from './contacts.repository';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly contacts: ContactsRepository,
    private readonly users: UsersRepository,
    private readonly directConversations: DirectConversationsService,
  ) {}

  private toContactResponse(contact: ContactWithUser) {
    if (!contact) return null;
    return {
      id: contact.id,
      ownerUserId: contact.ownerUserId,
      contactUserId: contact.contactUserId,
      nickname: contact.nickname,
      username: contact.contactUser.username,
      displayName: contact.contactUser.displayName,
      avatarUrl: contact.contactUser.avatarUrl,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }

  private async resolveTargetUser(dto: CreateContactDto) {
    if (dto.userId) {
      const user = await this.users.findById(dto.userId);
      if (user) return user;
    }

    if (dto.email) {
      const user = await this.users.findByEmail(dto.email);
      if (user) return user;
    }

    if (dto.username) {
      const user = await this.users.findByUsername(dto.username);
      if (user) return user;
    }

    return null;
  }

  async create(dto: CreateContactDto, currentUserId: string) {
    if (!dto.userId && !dto.email && !dto.username) {
      throw new BadRequestException('userId, email or username is required');
    }

    const targetUser = await this.resolveTargetUser(dto);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.id === currentUserId) {
      throw new BadRequestException('Cannot add yourself as a contact');
    }

    const contact = await this.contacts.upsertContact({
      ownerUserId: currentUserId,
      contactUserId: targetUser.id,
      nickname: dto.nickname ?? null,
    });

    return this.toContactResponse(contact);
  }

  async list(currentUserId: string) {
    const contacts = await this.contacts.listActiveByOwner(currentUserId);
    return contacts.map((c) => this.toContactResponse(c));
  }

  async remove(contactUserId: string, currentUserId: string) {
    const deletedCount = await this.contacts.softDeleteContact(
      currentUserId,
      contactUserId,
    );
    if (deletedCount === 0) {
      throw new NotFoundException('Contact not found');
    }
    return { success: true };
  }

  async startDirectConversation(contactUserId: string, currentUserId: string) {
    const contact = await this.contacts.findActiveByOwnerAndContact(
      currentUserId,
      contactUserId,
    );
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return this.directConversations.create(
      { userId: contactUserId },
      currentUserId,
    );
  }
}
