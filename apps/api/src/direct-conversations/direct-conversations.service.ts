import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  decodeMessageCursor,
  encodeMessageCursor,
  decodePinCursor,
  encodePinCursor,
} from '../common/cursor-pagination';
import { UsersRepository } from '../users/users.repository';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { PresenceService } from '../websocket/presence.service';
import { PushService } from '../push/push.service';
import { BlocksService } from '../safety/blocks.service';
import { MentionsService } from '../common/mentions.service';
import { mapAttachmentResponse } from '../messages/messages.service';
import { ForwardPermissionsHelper } from '../messages/forward-permissions.helper';
import {
  validateAttachmentFile,
  assertAttachmentAllowed,
} from '../messages/attachment-validation';
import {
  decodeMultipartFilename,
  sanitizeStorageFilename,
} from '../messages/attachments.service';
import { StorageService } from '../storage/storage.service';
import { AttachmentsRepository } from '../messages/attachments.repository';
import { DirectConversationsRepository } from './direct-conversations.repository';
import { StorageBackend, Prisma } from '@lets-chat/database';
import { randomUUID } from 'crypto';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { CreateDirectReactionDto } from './dto/create-direct-reaction.dto';
import { ListDirectMessagesQueryDto } from './dto/list-direct-messages-query.dto';
import { DirectMessageContextQueryDto } from './dto/message-context-query.dto';

@Injectable()
export class DirectConversationsService {
  constructor(
    private readonly directConversations: DirectConversationsRepository,
    private readonly users: UsersRepository,
    private readonly websocketEvents: WebsocketEventsService,
    private readonly presence: PresenceService,
    private readonly pushService: PushService,
    private readonly blocks: BlocksService,
    private readonly mentions: MentionsService,
    private readonly storage: StorageService,
    private readonly attachments: AttachmentsRepository,
    private readonly forwardPermissions: ForwardPermissionsHelper,
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
      hasUnread: unreadCount > 0,
      isOnline: otherParticipant
        ? await this.presence.isUserTracked(otherParticipant.id)
        : false,
    };
  }

  async toMessageResponse(
    message: Awaited<
      ReturnType<DirectConversationsRepository['createMessage']>
    >,
    currentUserId: string,
    myLastReadAt: Date | null,
    otherParticipantLastReadAt: Date | null,
    reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>,
  ) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      content: message.content,
      parentId: message.parentId,
      replyToMessageId: message.replyToMessageId ?? null,
      replyTo: message.replyToMessage
        ? {
            id: message.replyToMessage.id,
            content: message.replyToMessage.deletedAt
              ? null
              : message.replyToMessage.content,
            author: message.replyToMessage.deletedAt
              ? null
              : message.replyToMessage.author,
          }
        : null,
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
      attachments: (message.attachments ?? []).map(mapAttachmentResponse),
      readByOtherParticipant:
        message.authorId === currentUserId
          ? !!(
              otherParticipantLastReadAt &&
              otherParticipantLastReadAt >= message.createdAt
            )
          : false,
      isUnreadForMe:
        message.authorId === currentUserId
          ? false
          : myLastReadAt === null || message.createdAt > myLastReadAt,
      mentions: this.normalizeMentions(message.mentions),
      isPinned: !!message.pin,
      pin: message.pin
        ? {
            pinnedAt: message.pin.pinnedAt,
            pinnedByUserId: message.pin.pinnedByUserId,
          }
        : undefined,
      forwardedFrom: await this.forwardPermissions.toResponse(
        message.forwardedFrom,
        currentUserId,
      ),
    };
  }

  private normalizeMentions(
    value: unknown,
  ): Array<{ userId: string; username: string }> | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter(
      (item): item is { userId: string; username: string } =>
        typeof item === 'object' &&
        item !== null &&
        'userId' in item &&
        'username' in item &&
        typeof (item as { userId: unknown }).userId === 'string' &&
        typeof (item as { username: unknown }).username === 'string',
    );
  }

  private async requireParticipant(conversationId: string, userId: string) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      userId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }
    return participant;
  }

  private async mapPinResponse(
    pin: {
      id: string;
      pinnedAt: Date;
      pinnedBy: {
        id: string;
        username: string;
        displayName: string | null;
        avatarUrl: string | null;
      } | null;
      message: {
        id: string;
        content: string;
        createdAt: Date;
        author: {
          id: string;
          username: string;
          displayName: string | null;
          avatarUrl: string | null;
        } | null;
        attachments: Array<{ id: string }>;
        replyToMessage?: {
          id: string;
          content: string;
          deletedAt: Date | null;
          author: {
            id: string;
            username: string;
            displayName: string | null;
            avatarUrl: string | null;
          } | null;
        } | null;
        forwardedFrom?: unknown;
      };
    },
    userId: string,
  ) {
    const forwardedFrom = await this.forwardPermissions.toResponse(
      pin.message.forwardedFrom,
      userId,
    );

    return {
      id: pin.id,
      pinnedAt: pin.pinnedAt,
      pinnedBy: pin.pinnedBy
        ? {
            id: pin.pinnedBy.id,
            username: pin.pinnedBy.username,
            displayName: pin.pinnedBy.displayName,
          }
        : { id: '', username: '', displayName: null },
      message: {
        id: pin.message.id,
        content: pin.message.content,
        createdAt: pin.message.createdAt,
        author: pin.message.author
          ? {
              id: pin.message.author.id,
              username: pin.message.author.username,
              displayName: pin.message.author.displayName,
            }
          : { id: '', username: '', displayName: null },
        attachmentCount: pin.message.attachments?.length ?? 0,
        replyTo: pin.message.replyToMessage
          ? {
              id: pin.message.replyToMessage.id,
              content: pin.message.replyToMessage.deletedAt
                ? null
                : pin.message.replyToMessage.content,
              author: pin.message.replyToMessage.deletedAt
                ? null
                : pin.message.replyToMessage.author
                  ? {
                      id: pin.message.replyToMessage.author.id,
                      username: pin.message.replyToMessage.author.username,
                      displayName:
                        pin.message.replyToMessage.author.displayName,
                    }
                  : null,
            }
          : null,
        forwardedFrom,
      },
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

    await this.blocks.requireNoBlockInEitherDirection(
      currentUserId,
      targetUser.id,
      'Cannot start a conversation with this user',
    );

    const key = this.makePairKey(currentUserId, targetUser.id);
    const existing = await this.directConversations.findByKey(key);

    if (existing) {
      return this.toConversationResponse(existing, currentUserId);
    }

    try {
      const created = await this.directConversations.createConversation({
        key,
        participantIds: [currentUserId, targetUser.id],
      });

      return this.toConversationResponse(created, currentUserId);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        const raceExisting = await this.directConversations.findByKey(key);
        if (raceExisting) {
          return this.toConversationResponse(raceExisting, currentUserId);
        }
      }
      throw error;
    }
  }

  async list(currentUserId: string) {
    const conversations =
      await this.directConversations.listForUser(currentUserId);
    return Promise.all(
      conversations.map((c) => this.toConversationResponse(c, currentUserId)),
    );
  }

  async listMessages(
    conversationId: string,
    currentUserId: string,
    query?: ListDirectMessagesQueryDto,
  ) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      currentUserId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    const limit = Math.min(query?.limit ?? 50, 100);
    const cursor = query?.cursor
      ? decodeMessageCursor(query.cursor)
      : undefined;
    if (query?.cursor && !cursor) {
      throw new BadRequestException('Invalid cursor format');
    }

    const participants =
      await this.directConversations.findParticipants(conversationId);
    const myParticipant = participants.find((p) => p.userId === currentUserId);
    const myLastReadAt = myParticipant?.lastReadAt ?? null;
    const otherParticipant = participants.find(
      (p) => p.userId !== currentUserId,
    );
    const otherParticipantLastReadAt = otherParticipant?.lastReadAt ?? null;

    const rows = await this.directConversations.listMessagesForConversation(
      conversationId,
      limit,
      cursor,
    );
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse();

    const reactionsMap = new Map<
      string,
      Array<{ emoji: string; count: number; reactedByMe: boolean }>
    >();
    for (const message of page) {
      const reactions =
        await this.directConversations.getDirectMessageReactions(
          message.id,
          currentUserId,
        );
      reactionsMap.set(message.id, reactions);
    }

    const items = await Promise.all(
      page.map((m) =>
        this.toMessageResponse(
          m,
          currentUserId,
          myLastReadAt,
          otherParticipantLastReadAt,
          reactionsMap.get(m.id) ?? [],
        ),
      ),
    );

    return {
      items,
      nextCursor:
        hasMore && page.length > 0 ? encodeMessageCursor(page[0]) : null,
      hasMore,
    };
  }

  async getMessageContext(
    conversationId: string,
    messageId: string,
    currentUserId: string,
    query: DirectMessageContextQueryDto,
  ) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      currentUserId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    const target =
      await this.directConversations.findMessageByIdWithRelations(messageId);
    if (!target || target.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    const participants =
      await this.directConversations.findParticipants(conversationId);
    const myParticipant = participants.find((p) => p.userId === currentUserId);
    const myLastReadAt = myParticipant?.lastReadAt ?? null;
    const otherParticipant = participants.find(
      (p) => p.userId !== currentUserId,
    );
    const otherParticipantLastReadAt = otherParticipant?.lastReadAt ?? null;

    const beforeLimit = Math.min(query.before ?? 20, 50);
    const afterLimit = Math.min(query.after ?? 20, 50);

    const [beforeRaw, afterRaw] = await Promise.all([
      this.directConversations.findContextBefore(
        conversationId,
        target.createdAt,
        beforeLimit,
      ),
      this.directConversations.findContextAfter(
        conversationId,
        target.createdAt,
        afterLimit,
      ),
    ]);

    const hasMoreBefore = beforeRaw.length > beforeLimit;
    const hasMoreAfter = afterRaw.length > afterLimit;

    const contextMessages = [
      ...(hasMoreBefore ? beforeRaw.slice(0, beforeLimit) : beforeRaw),
      target,
      ...(hasMoreAfter ? afterRaw.slice(0, afterLimit) : afterRaw),
    ];
    const reactionsMap = new Map<
      string,
      Array<{ emoji: string; count: number; reactedByMe: boolean }>
    >();
    for (const message of contextMessages) {
      const reactions =
        await this.directConversations.getDirectMessageReactions(
          message.id,
          currentUserId,
        );
      reactionsMap.set(message.id, reactions);
    }

    const toResponse = async (
      m: (typeof contextMessages)[number],
    ): Promise<ReturnType<DirectConversationsService['toMessageResponse']>> =>
      this.toMessageResponse(
        m,
        currentUserId,
        myLastReadAt,
        otherParticipantLastReadAt,
        reactionsMap.get(m.id) ?? [],
      );

    const before = await Promise.all(
      (hasMoreBefore ? beforeRaw.slice(0, beforeLimit) : beforeRaw)
        .reverse()
        .map(toResponse),
    );

    const after = await Promise.all(
      (hasMoreAfter ? afterRaw.slice(0, afterLimit) : afterRaw).map(toResponse),
    );

    return {
      target: await toResponse(target),
      before,
      after,
      hasMoreBefore,
      hasMoreAfter,
    };
  }

  async createMessage(
    conversationId: string,
    dto: CreateDirectMessageDto,
    currentUserId: string,
    forwardedFrom?: Prisma.InputJsonValue,
  ) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      currentUserId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    const participants =
      await this.directConversations.findParticipants(conversationId);
    const otherParticipant = participants.find(
      (p) => p.userId !== currentUserId,
    );

    if (otherParticipant) {
      await this.blocks.requireNoBlockInEitherDirection(
        currentUserId,
        otherParticipant.userId,
        'Cannot send messages to this user',
      );
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

    if (dto.replyToMessageId) {
      const replyTarget = await this.directConversations.findMessageById(
        dto.replyToMessageId,
      );
      if (
        !replyTarget ||
        replyTarget.conversationId !== conversationId ||
        replyTarget.deletedAt !== null
      ) {
        throw new BadRequestException('Reply target message not found');
      }
    }

    const myParticipant = participants.find((p) => p.userId === currentUserId);
    const myLastReadAt = myParticipant?.lastReadAt ?? null;
    const otherParticipantLastReadAt = otherParticipant?.lastReadAt ?? null;

    const mentionableUserIds = new Set(
      await this.directConversations.findMentionableUserIds(
        conversationId,
        currentUserId,
      ),
    );
    const content = dto.content?.trim() ?? '';
    const mentions = await this.mentions.resolveMentions(
      content,
      mentionableUserIds,
    );

    const attachmentIds = dto.attachmentIds?.length
      ? Array.from(new Set(dto.attachmentIds))
      : [];
    if (attachmentIds.length > 0) {
      const attachments =
        await this.directConversations.findUnattachedAttachmentsByIds(
          attachmentIds,
          currentUserId,
        );
      if (attachments.length !== attachmentIds.length) {
        throw new BadRequestException(
          'One or more attachments are invalid or already in use',
        );
      }
    }

    const hasContent = content.length > 0;
    const hasAttachments = attachmentIds.length > 0;
    if (!hasContent && !hasAttachments) {
      throw new BadRequestException(
        'Message content or attachment is required',
      );
    }

    const message = await this.directConversations.createMessage({
      conversationId,
      authorId: currentUserId,
      content,
      parentId: dto.parentId,
      replyToMessageId: dto.replyToMessageId,
      mentions,
      forwardedFrom,
      ...(attachmentIds.length > 0 && { attachmentIds }),
    });

    await this.directConversations.touchConversationUpdatedAt(conversationId);

    const response = await this.toMessageResponse(
      message,
      currentUserId,
      myLastReadAt,
      otherParticipantLastReadAt,
    );
    this.websocketEvents.broadcastDirectMessageCreated(
      conversationId,
      response,
    );

    this.websocketEvents.broadcastDirectConversationUpdated(
      conversationId,
      response,
      participants.map((p) => p.userId),
    );

    this.pushService
      .notifyDirectMessage(conversationId, {
        id: message.id,
        content: message.content,
        authorId: message.authorId,
      })
      .catch(() => {
        // Push notifications are best-effort and must not break messaging.
      });

    if (mentions.length > 0) {
      this.pushService
        .notifyDirectMention(conversationId, {
          id: message.id,
          content: message.content,
          authorId: message.authorId,
          mentions,
        })
        .catch(() => {
          // Mention notifications are best-effort.
        });
    }

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

    if (message.deletedAt !== null) {
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

    const participants =
      await this.directConversations.findParticipants(conversationId);
    const myParticipant = participants.find((p) => p.userId === userId);
    const myLastReadAt = myParticipant?.lastReadAt ?? null;
    const otherParticipant = participants.find((p) => p.userId !== userId);
    const otherParticipantLastReadAt = otherParticipant?.lastReadAt ?? null;

    const updated = await this.directConversations.updateDirectMessageContent(
      messageId,
      trimmed,
    );

    const reactions = await this.directConversations.getDirectMessageReactions(
      messageId,
      userId,
    );

    const response = await this.toMessageResponse(
      updated,
      userId,
      myLastReadAt,
      otherParticipantLastReadAt,
      reactions,
    );
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

    const readAt = new Date();
    this.websocketEvents.broadcastDirectConversationRead(conversationId, {
      conversationId,
      userId: currentUserId,
      readAt: readAt.toISOString(),
    });

    return { success: true, lastReadAt: readAt.toISOString() };
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

    if (message.deletedAt !== null) {
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

    try {
      await this.directConversations.createDirectReaction({
        messageId,
        userId,
        emoji: dto.emoji,
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        // Race: another request created the same reaction concurrently.
        // Return current state.
      } else {
        throw error;
      }
    }

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

    if (message.deletedAt !== null) {
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

  async uploadAttachment(
    conversationId: string,
    file: Express.Multer.File,
    userId: string,
  ) {
    const participant = await this.directConversations.findParticipant(
      conversationId,
      userId,
    );
    if (!participant) {
      throw new ForbiddenException('Access denied');
    }

    const normalizedMimeType = assertAttachmentAllowed(
      await validateAttachmentFile(file),
    );

    const decodedOriginalName = decodeMultipartFilename(file.originalname);
    const sanitized = sanitizeStorageFilename(decodedOriginalName);
    const storageKey = `attachments/${userId}/${randomUUID()}-${sanitized}`;

    await this.storage.putObject(storageKey, file.buffer, normalizedMimeType);

    const attachment = await this.attachments.createUnattachedAttachment({
      createdById: userId,
      filename: decodedOriginalName,
      originalName: decodedOriginalName,
      mimeType: normalizedMimeType,
      size: file.size,
      storageKey,
      storageBackend: StorageBackend.MINIO,
    });

    return mapAttachmentResponse(attachment);
  }

  async downloadAttachmentFile(
    conversationId: string,
    messageId: string,
    attachmentId: string,
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

    const attachment = await this.attachments.findById(attachmentId);
    if (
      !attachment ||
      attachment.directMessageId !== messageId ||
      attachment.deletedAt !== null
    ) {
      throw new NotFoundException('Attachment not found');
    }

    const object = await this.storage.getObject(attachment.storageKey);
    return {
      body: object.body,
      contentType: object.contentType,
      contentLength: object.contentLength,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.size,
    };
  }

  async pinMessage(conversationId: string, messageId: string, userId: string) {
    await this.requireParticipant(conversationId, userId);

    const message = await this.directConversations.findMessageById(messageId);
    if (
      !message ||
      message.conversationId !== conversationId ||
      message.deletedAt !== null
    ) {
      throw new NotFoundException('Message not found');
    }

    const pin = await this.directConversations.pinMessage(
      conversationId,
      messageId,
      userId,
    );

    this.websocketEvents.broadcastDirectMessagePinned(conversationId, {
      id: message.id,
      conversationId,
      pinnedAt: pin.pinnedAt,
      pinnedByUserId: userId,
      pinnedBy: pin.pinnedBy
        ? {
            id: pin.pinnedBy.id,
            username: pin.pinnedBy.username,
            displayName: pin.pinnedBy.displayName,
            avatarUrl: pin.pinnedBy.avatarUrl,
          }
        : { id: userId, username: '', displayName: null, avatarUrl: null },
    });

    return this.mapPinResponse(pin, userId);
  }

  async unpinMessage(
    conversationId: string,
    messageId: string,
    userId: string,
  ) {
    await this.requireParticipant(conversationId, userId);

    const message = await this.directConversations.findMessageById(messageId);
    if (
      !message ||
      message.conversationId !== conversationId ||
      message.deletedAt !== null
    ) {
      throw new NotFoundException('Message not found');
    }

    await this.directConversations.unpinMessage(messageId);

    this.websocketEvents.broadcastDirectMessageUnpinned(conversationId, {
      id: message.id,
      conversationId,
    });
  }

  async listPinnedMessages(
    conversationId: string,
    userId: string,
    query: { limit?: number; cursor?: string },
  ) {
    await this.requireParticipant(conversationId, userId);

    const limit = Math.min(query.limit ?? 20, 50);
    const cursor = query.cursor ? decodePinCursor(query.cursor) : undefined;
    if (query.cursor && !cursor) {
      throw new BadRequestException('Invalid cursor format');
    }

    const rows = await this.directConversations.findPinnedMessages(
      conversationId,
      limit,
      cursor,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: await Promise.all(page.map((p) => this.mapPinResponse(p, userId))),
      nextCursor:
        hasMore && page.length > 0
          ? encodePinCursor({
              pinnedAt: page[page.length - 1].pinnedAt,
              id: page[page.length - 1].id,
            })
          : null,
      hasMore,
    };
  }
}
