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
import { CreateDirectReactionDto } from './dto/create-direct-reaction.dto';

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
    reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>,
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
      reactions: reactions ?? [],
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
    const reactionsMap = new Map<
      string,
      Array<{ emoji: string; count: number; reactedByMe: boolean }>
    >();
    for (const message of messages) {
      const reactions =
        await this.directConversations.getDirectMessageReactions(
          message.id,
          currentUserId,
        );
      reactionsMap.set(message.id, reactions);
    }
    return messages.map((m) =>
      this.toMessageResponse(m, reactionsMap.get(m.id) ?? []),
    );
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

  async updateMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    content: string,
  ) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      userId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    const message = await this.directConversations.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this message');
    }

    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('Content is required');
    }
    if (trimmed.length > 4000) {
      throw new BadRequestException('Content must be at most 4000 characters');
    }

    const updated = await this.directConversations.updateDirectMessageContent(
      messageId,
      trimmed,
    );

    const reactions = await this.directConversations.getDirectMessageReactions(
      messageId,
      userId,
    );

    const response = this.toMessageResponse(updated, reactions);
    this.websocketEvents.broadcastDirectMessageUpdated(
      conversationId,
      response,
    );

    const conversation =
      await this.directConversations.findById(conversationId);
    if (conversation?.messages[0]?.id === messageId) {
      const participants =
        await this.directConversations.findParticipants(conversationId);
      this.websocketEvents.broadcastDirectConversationUpdated(
        conversationId,
        response,
        participants.map((p) => p.userId),
      );
    }

    return response;
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      userId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    const message = await this.directConversations.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    if (message.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete this message');
    }

    if (message.deletedAt) {
      return { ok: true };
    }

    const conversationBefore =
      await this.directConversations.findById(conversationId);
    const wasLastMessage = conversationBefore?.messages[0]?.id === messageId;

    await this.directConversations.softDeleteDirectMessage(messageId);

    this.websocketEvents.broadcastDirectMessageDeleted(conversationId, {
      conversationId,
      messageId,
    });

    if (wasLastMessage) {
      const conversationAfter =
        await this.directConversations.findById(conversationId);
      const lastMessage = conversationAfter?.messages[0] ?? null;
      const participants =
        await this.directConversations.findParticipants(conversationId);
      this.websocketEvents.broadcastDirectConversationUpdated(
        conversationId,
        {
          conversationId,
          updatedAt: new Date(),
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                content: lastMessage.content,
                createdAt: lastMessage.createdAt,
                authorId: lastMessage.authorId,
              }
            : null,
        },
        participants.map((p) => p.userId),
      );
    }

    return { ok: true };
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

  async addReaction(
    conversationId: string,
    messageId: string,
    dto: CreateDirectReactionDto,
    userId: string,
  ) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      userId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    const message = await this.directConversations.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    const existingSameEmoji = await this.directConversations.findDirectReaction(
      messageId,
      userId,
      dto.emoji,
    );

    if (existingSameEmoji) {
      // Toggle off: user clicked the same emoji they already have
      await this.directConversations.deleteDirectReaction(existingSameEmoji.id);

      const reactions =
        await this.directConversations.getDirectMessageReactions(
          messageId,
          userId,
        );

      const user = await this.users.findById(userId);
      this.websocketEvents.broadcastDirectReactionRemoved(conversationId, {
        messageId,
        conversationId,
        emoji: dto.emoji,
        user: user
          ? { id: user.id, username: user.username }
          : { id: userId, username: '' },
        reactions,
      });

      return reactions;
    }

    // Replace: remove any previous reaction by this user on this message,
    // then create the new one.
    await this.directConversations.deleteDirectReactionsForUser(
      messageId,
      userId,
    );

    await this.directConversations.createDirectReaction({
      messageId,
      userId,
      emoji: dto.emoji,
    });

    const reactions = await this.directConversations.getDirectMessageReactions(
      messageId,
      userId,
    );

    const user = await this.users.findById(userId);
    this.websocketEvents.broadcastDirectReactionAdded(conversationId, {
      messageId,
      conversationId,
      emoji: dto.emoji,
      user: user
        ? { id: user.id, username: user.username }
        : { id: userId, username: '' },
      reactions,
    });

    return reactions;
  }

  async removeReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      userId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    const message = await this.directConversations.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji || normalizedEmoji.length > 32) {
      throw new BadRequestException('Invalid emoji');
    }

    const existing = await this.directConversations.findDirectReaction(
      messageId,
      userId,
      normalizedEmoji,
    );
    if (existing) {
      await this.directConversations.deleteDirectReaction(existing.id);
    }

    const reactions = await this.directConversations.getDirectMessageReactions(
      messageId,
      userId,
    );

    const user = await this.users.findById(userId);
    this.websocketEvents.broadcastDirectReactionRemoved(conversationId, {
      messageId,
      conversationId,
      emoji: normalizedEmoji,
      user: user
        ? { id: user.id, username: user.username }
        : { id: userId, username: '' },
      reactions,
    });

    return reactions;
  }
}
