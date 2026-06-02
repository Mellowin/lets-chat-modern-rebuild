import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { DirectConversationsRepository } from './direct-conversations.repository';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';

@Injectable()
export class DirectConversationsService {
  constructor(
    private readonly directConversations: DirectConversationsRepository,
    private readonly users: UsersRepository,
    private readonly websocketEvents: WebsocketEventsService,
  ) {}

  private makePairKey(userIdA: string, userIdB: string): string {
    return userIdA < userIdB
      ? `${userIdA}:${userIdB}`
      : `${userIdB}:${userIdA}`;
  }

  private async toConversationResponse(
    conversation: NonNullable<
      Awaited<ReturnType<DirectConversationsRepository['findById']>>
    >,
    currentUserId: string,
  ) {
    const otherParticipant = conversation.participants.find(
      (p) => p.user.id !== currentUserId,
    )?.user;

    const lastMessage = conversation.messages[0] ?? null;
    const myParticipant = conversation.participants.find(
      (p) => p.user.id === currentUserId,
    );

    const unreadCount = await this.directConversations.countUnreadMessages(
      conversation.id,
      currentUserId,
      myParticipant?.lastReadAt ?? null,
    );

    return {
      id: conversation.id,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      otherParticipant: otherParticipant
        ? {
            id: otherParticipant.id,
            username: otherParticipant.username,
            displayName: otherParticipant.displayName,
            avatarUrl: otherParticipant.avatarUrl,
          }
        : null,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            createdAt: lastMessage.createdAt,
            authorId: lastMessage.authorId,
          }
        : null,
      unreadCount,
    };
  }

  private toMessageResponse(
    message: Awaited<
      ReturnType<DirectConversationsRepository['createMessage']>
    >,
  ) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      content: message.content,
      parentId: message.parentId,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      editedAt: message.editedAt,
      author: message.author,
      parent: message.parent
        ? {
            id: message.parent.id,
            content: message.parent.content,
            author: message.parent.author,
          }
        : null,
    };
  }

  async create(dto: CreateDirectConversationDto, currentUserId: string) {
    if (!dto.userId && !dto.usernameOrEmail) {
      throw new BadRequestException('userId or usernameOrEmail is required');
    }

    let targetUser = null;

    if (dto.userId) {
      targetUser = await this.users.findById(dto.userId);
    }

    if (!targetUser && dto.usernameOrEmail) {
      const trimmed = dto.usernameOrEmail.trim();
      targetUser = await this.users.findByUsername(trimmed);
      if (!targetUser) {
        targetUser = await this.users.findByEmail(trimmed);
      }
    }

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.id === currentUserId) {
      throw new BadRequestException(
        'Cannot create a conversation with yourself',
      );
    }

    const key = this.makePairKey(currentUserId, targetUser.id);
    const existing = await this.directConversations.findByKey(key);

    if (existing) {
      return this.toConversationResponse(existing, currentUserId);
    }

    const created = await this.directConversations.createConversation({
      key,
      participantIds: [currentUserId, targetUser.id],
    });

    return this.toConversationResponse(created, currentUserId);
  }

  async list(currentUserId: string) {
    const conversations =
      await this.directConversations.listForUser(currentUserId);
    return Promise.all(
      conversations.map((c) => this.toConversationResponse(c, currentUserId)),
    );
  }

  async listMessages(conversationId: string, currentUserId: string) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      currentUserId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    const messages =
      await this.directConversations.listMessagesForConversation(
        conversationId,
      );
    return messages.map((m) => this.toMessageResponse(m));
  }

  async createMessage(
    conversationId: string,
    dto: CreateDirectMessageDto,
    currentUserId: string,
  ) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      currentUserId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    if (dto.parentId) {
      const parent = await this.directConversations.findMessageById(
        dto.parentId,
      );
      if (
        !parent ||
        parent.conversationId !== conversationId ||
        parent.deletedAt !== null
      ) {
        throw new BadRequestException('Parent message not found');
      }
      if (parent.parentId !== null) {
        throw new BadRequestException('Cannot reply to a reply');
      }
    }

    const message = await this.directConversations.createMessage({
      conversationId,
      authorId: currentUserId,
      content: dto.content,
      parentId: dto.parentId,
    });

    await this.directConversations.touchConversationUpdatedAt(conversationId);

    const response = this.toMessageResponse(message);
    this.websocketEvents.broadcastDirectMessageCreated(
      conversationId,
      response,
    );

    const participants =
      await this.directConversations.findParticipants(conversationId);
    this.websocketEvents.broadcastDirectConversationUpdated(
      conversationId,
      response,
      participants.map((p) => p.userId),
    );

    return response;
  }

  async markAsRead(conversationId: string, currentUserId: string) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      currentUserId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    await this.directConversations.updateParticipantLastRead(
      conversationId,
      currentUserId,
    );

    return { ok: true };
  }
}
