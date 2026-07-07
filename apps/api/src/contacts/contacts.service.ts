import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';
import { UsersRepository } from '../users/users.repository';
import { DirectConversationsService } from '../direct-conversations/direct-conversations.service';
import { BlocksService } from '../safety/blocks.service';
import { ContactsRepository, ContactWithUser } from './contacts.repository';
import { ContactRequestsRepository } from './contact-requests.repository';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contacts: ContactsRepository,
    private readonly contactRequests: ContactRequestsRepository,
    private readonly users: UsersRepository,
    private readonly directConversations: DirectConversationsService,
    private readonly blocks: BlocksService,
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

  private toRequestResponse(
    request: Awaited<
      ReturnType<ContactRequestsRepository['findPendingByIdForRecipient']>
    >,
  ) {
    if (!request) return null;
    return {
      id: request.id,
      fromUserId: request.fromUserId,
      toUserId: request.toUserId,
      status: request.status,
      createdAt: request.createdAt,
      fromUser: request.fromUser,
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

    await this.blocks.requireNoBlockInEitherDirection(
      currentUserId,
      targetUser.id,
      'Cannot add this user to contacts',
    );

    const privacy = targetUser.contactPrivacySetting ?? 'REQUESTS_ONLY';

    if (privacy === 'NOBODY') {
      throw new ForbiddenException(
        'This user does not accept contact requests',
      );
    }

    const existingContact = await this.contacts.findActiveByOwnerAndContact(
      currentUserId,
      targetUser.id,
    );
    if (existingContact) {
      return {
        type: 'contact' as const,
        ...this.toContactResponse(existingContact),
      };
    }

    if (privacy === 'EVERYONE') {
      const contact = await this.contacts.upsertContact({
        ownerUserId: currentUserId,
        contactUserId: targetUser.id,
        nickname: dto.nickname ?? null,
      });
      return { type: 'contact' as const, ...this.toContactResponse(contact) };
    }

    // REQUESTS_ONLY: check for cross-request and auto-accept if the target already
    // sent a pending request to the current user.
    const incomingRequest = await this.contactRequests.findBetweenUsers(
      targetUser.id,
      currentUserId,
    );
    if (incomingRequest?.status === 'PENDING') {
      await this.acceptRequestByUsers(currentUserId, targetUser.id);
      const contact = await this.contacts.findActiveByOwnerAndContact(
        currentUserId,
        targetUser.id,
      );
      return {
        type: 'contact' as const,
        ...this.toContactResponse(contact),
      };
    }

    const existingOutgoing = await this.contactRequests.findBetweenUsers(
      currentUserId,
      targetUser.id,
    );
    if (existingOutgoing?.status === 'PENDING') {
      return {
        type: 'request' as const,
        id: existingOutgoing.id,
        fromUserId: existingOutgoing.fromUserId,
        toUserId: existingOutgoing.toUserId,
        status: existingOutgoing.status,
        createdAt: existingOutgoing.createdAt,
      };
    }

    const request = await this.contactRequests.upsertPending(
      currentUserId,
      targetUser.id,
    );

    return {
      type: 'request' as const,
      id: request.id,
      fromUserId: request.fromUserId,
      toUserId: request.toUserId,
      status: request.status,
      createdAt: request.createdAt,
    };
  }

  async list(currentUserId: string) {
    const contacts = await this.contacts.listActiveByOwner(currentUserId);
    const blockedIds = new Set(
      (await this.blocks.listBlockedUsers(currentUserId)).map(
        (b) => b.blockedUserId,
      ),
    );
    return contacts
      .filter((c) => !blockedIds.has(c.contactUserId))
      .map((c) => this.toContactResponse(c));
  }

  async listRequests(currentUserId: string) {
    const requests =
      await this.contactRequests.listPendingForRecipient(currentUserId);
    return requests.map((r) => this.toRequestResponse(r));
  }

  async acceptRequest(requestId: string, currentUserId: string) {
    const request = await this.contactRequests.findPendingByIdForRecipient(
      requestId,
      currentUserId,
    );
    if (!request) {
      throw new NotFoundException('Contact request not found');
    }

    await this.acceptRequestByUsers(currentUserId, request.fromUserId);

    return { success: true };
  }

  private async acceptRequestByUsers(
    recipientUserId: string,
    senderUserId: string,
  ) {
    const request = await this.contactRequests.findBetweenUsers(
      senderUserId,
      recipientUserId,
    );
    if (!request) {
      throw new NotFoundException('Contact request not found');
    }

    await this.blocks.requireNoBlockInEitherDirection(
      senderUserId,
      recipientUserId,
      'Cannot add this user to contacts',
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.contactRequest.update({
        where: { id: request.id },
        data: {
          status: 'ACCEPTED',
          declinedAt: null,
          updatedAt: new Date(),
        },
      });

      const now = new Date();
      await tx.userContact.upsert({
        where: {
          ownerUserId_contactUserId: {
            ownerUserId: senderUserId,
            contactUserId: recipientUserId,
          },
        },
        create: {
          ownerUserId: senderUserId,
          contactUserId: recipientUserId,
        },
        update: { deletedAt: null, updatedAt: now },
      });

      await tx.userContact.upsert({
        where: {
          ownerUserId_contactUserId: {
            ownerUserId: recipientUserId,
            contactUserId: senderUserId,
          },
        },
        create: {
          ownerUserId: recipientUserId,
          contactUserId: senderUserId,
        },
        update: { deletedAt: null, updatedAt: now },
      });
    });
  }

  async declineRequest(requestId: string, currentUserId: string) {
    const request = await this.contactRequests.findPendingByIdForRecipient(
      requestId,
      currentUserId,
    );
    if (!request) {
      throw new NotFoundException('Contact request not found');
    }

    await this.contactRequests.updateStatus(request.id, 'DECLINED', new Date());

    return { success: true };
  }

  async cancelRequest(requestId: string, currentUserId: string) {
    const request = await this.contactRequests.findPendingByIdForSender(
      requestId,
      currentUserId,
    );
    if (!request) {
      throw new NotFoundException('Contact request not found');
    }

    await this.contactRequests.deleteById(request.id);
    return { success: true };
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
