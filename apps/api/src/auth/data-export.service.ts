import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '@lets-chat/database';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';

export interface DataExportResult {
  streamed: boolean;
}

interface JsonValue {
  [key: string]: unknown;
}

@Injectable()
export class DataExportService {
  private readonly BATCH_SIZE = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async exportUserData(
    userId: string,
    currentPassword: string,
    res: Response,
  ): Promise<DataExportResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordValid = await this.password.verifyPassword(
      currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.streamExport(userId, res);

    await this.audit.record({
      actorId: userId,
      action: AuditAction.USER_DATA_EXPORTED,
      entityType: AuditEntityType.USER,
      entityId: userId,
      severity: AuditSeverity.INFO,
      metadata: {
        exportFormatVersion: '1.0.0',
      },
    });

    return { streamed: true };
  }

  private async streamExport(userId: string, res: Response): Promise<void> {
    const filename = `lets-chat-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200);

    const profile = await this.loadProfile(userId);

    await this.write(res, '{');
    await this.writeJsonObjectField(res, 'exportFormatVersion', '1.0.0', true);
    await this.writeJsonObjectField(
      res,
      'exportedAt',
      new Date().toISOString(),
      false,
    );
    await this.writeJsonObjectField(
      res,
      'notice',
      'Attachment binaries are not included. Download each active attachment individually before requesting account deletion.',
      false,
    );
    await this.writeJsonObjectField(res, 'profile', profile, false);

    await this.streamEntityArray(res, 'workspaceMemberships', (lastId) =>
      this.prisma.workspaceMember.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          workspaceId: true,
          role: true,
          createdAt: true,
          workspace: { select: { name: true, slug: true } },
        },
      }),
    );

    await this.streamEntityArray(res, 'channelMemberships', (lastId) =>
      this.prisma.channelMember.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          channelId: true,
          role: true,
          createdAt: true,
          channel: { select: { name: true, slug: true, type: true } },
        },
      }),
    );

    await this.streamEntityArray(res, 'groupMemberships', (lastId) =>
      this.prisma.groupMember.findMany({
        where: {
          userId,
          leftAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          groupId: true,
          role: true,
          joinedAt: true,
          group: { select: { name: true, createdAt: true } },
        },
      }),
    );

    await this.streamEntityArray(res, 'createdWorkspaces', (lastId) =>
      this.prisma.workspace.findMany({
        where: {
          ownerId: userId,
          deletedAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'createdChannels', (lastId) =>
      this.prisma.channel.findMany({
        where: {
          createdById: userId,
          deletedAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          workspaceId: true,
          name: true,
          slug: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'createdGroups', (lastId) =>
      this.prisma.groupConversation.findMany({
        where: {
          createdById: userId,
          archivedAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'reactions', (lastId) =>
      this.prisma.reaction.findMany({
        where: {
          userId,
          deletedAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          messageId: true,
          emoji: true,
          createdAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'directReactions', (lastId) =>
      this.prisma.directMessageReaction.findMany({
        where: {
          userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          messageId: true,
          emoji: true,
          createdAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'contacts', (lastId) =>
      this.prisma.userContact.findMany({
        where: {
          ownerUserId: userId,
          deletedAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          contactUserId: true,
          nickname: true,
          createdAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'blocks', (lastId) =>
      this.prisma.userBlock.findMany({
        where: {
          blockerId: userId,
          deletedAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          blockedId: true,
          reason: true,
          createdAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'reports', (lastId) =>
      this.prisma.userReport.findMany({
        where: {
          reporterId: userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          reportedUserId: true,
          messageId: true,
          directConversationId: true,
          groupId: true,
          reason: true,
          details: true,
          status: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'attachments', (lastId) =>
      this.prisma.attachment.findMany({
        where: {
          createdById: userId,
          deletedAt: null,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          filename: true,
          originalName: true,
          mimeType: true,
          size: true,
          storageKey: true,
          storageBackend: true,
          messageId: true,
          directMessageId: true,
          groupMessageId: true,
          createdAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'sessions', (lastId) =>
      this.prisma.refreshToken.findMany({
        where: {
          userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
          ipAddress: true,
          userAgent: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'notifications', (lastId) =>
      this.prisma.notification.findMany({
        where: {
          userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          entityType: true,
          entityId: true,
          workspaceId: true,
          channelId: true,
          isRead: true,
          readAt: true,
          createdAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'pushSubscriptions', (lastId) =>
      this.prisma.pushSubscription.findMany({
        where: {
          userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          endpoint: true,
          userAgent: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'sentContactRequests', (lastId) =>
      this.prisma.contactRequest.findMany({
        where: {
          fromUserId: userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          toUserId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          declinedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'receivedContactRequests', (lastId) =>
      this.prisma.contactRequest.findMany({
        where: {
          toUserId: userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          fromUserId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          declinedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'sentInvitations', (lastId) =>
      this.prisma.invitation.findMany({
        where: {
          invitedById: userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          workspaceId: true,
          role: true,
          invitedEmail: true,
          maxUses: true,
          usesCount: true,
          usedById: true,
          usedAt: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'acceptedInvitations', (lastId) =>
      this.prisma.invitation.findMany({
        where: {
          usedById: userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          workspaceId: true,
          invitedById: true,
          role: true,
          invitedEmail: true,
          maxUses: true,
          usesCount: true,
          usedAt: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'sentChannelInvitations', (lastId) =>
      this.prisma.channelInvitation.findMany({
        where: {
          invitedById: userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          workspaceId: true,
          channelId: true,
          role: true,
          invitedEmail: true,
          usedById: true,
          usedAt: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'acceptedChannelInvitations', (lastId) =>
      this.prisma.channelInvitation.findMany({
        where: {
          usedById: userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          workspaceId: true,
          channelId: true,
          invitedById: true,
          role: true,
          invitedEmail: true,
          usedAt: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
    );

    await this.streamEntityArray(res, 'auditLogs', (lastId) =>
      this.prisma.auditLog.findMany({
        // B238A: export only audit rows where the requesting user is the actor.
        // Rows created by other actors (reports, moderator actions, blocks, etc.)
        // may contain confidential metadata such as admin notes, report reasons,
        // reporter identities, or other users' IPs / user agents.
        where: {
          actorId: userId,
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: this.BATCH_SIZE,
        select: {
          id: true,
          actorId: true,
          targetUserId: true,
          action: true,
          entityType: true,
          entityId: true,
          workspaceId: true,
          channelId: true,
          groupId: true,
          severity: true,
          createdAt: true,
        },
      }),
    );

    await this.write(res, ',"pinnedChannelMessages":');
    await this.streamPinnedChannelMessages(userId, res);

    await this.write(res, ',"pinnedDirectMessages":');
    await this.streamPinnedDirectMessages(userId, res);

    await this.write(res, ',"pinnedGroupMessages":');
    await this.streamPinnedGroupMessages(userId, res);

    await this.write(res, ',"messages":');
    await this.streamMessages(userId, res);

    await this.write(res, ',"directMessages":');
    await this.streamDirectMessages(userId, res);

    await this.write(res, ',"groupMessages":');
    await this.streamGroupMessages(userId, res);

    await this.write(res, '}');
    res.end();
  }

  private async write(res: Response, chunk: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ok = res.write(chunk, (err: Error | null | undefined) => {
        if (err) reject(err);
      });
      if (ok) {
        resolve();
      } else {
        res.once('drain', resolve);
        res.once('error', reject);
      }
    });
  }

  private async writeJsonObjectField(
    res: Response,
    key: string,
    value: unknown,
    first: boolean,
  ): Promise<void> {
    const prefix = first ? '' : ',';
    await this.write(res, `${prefix}"${key}":${JSON.stringify(value)}`);
  }

  private async loadProfile(userId: string): Promise<Record<string, unknown>> {
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        interfaceLanguage: true,
        role: true,
        contactPrivacySetting: true,
        pushNotificationsEnabled: true,
        mentionNotificationsEnabled: true,
        directMessageNotificationsEnabled: true,
        groupMessageNotificationsEnabled: true,
        channelMessageNotificationsEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!profile) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const safeProfile = profile as Record<string, unknown>;
    const unsafeProfileFields = [
      'passwordHash',
      'emailVerificationTokenHash',
      'passwordResetTokenHash',
      'emailChangeTokenHash',
      'deletionCancellationTokenHash',
      'deletionScheduledFor',
      'deletionCancellationExpiresAt',
      'deletionRequestedAt',
      'anonymizedAt',
      'deletedAt',
      'refreshTokens',
    ];
    for (const field of unsafeProfileFields) {
      delete safeProfile[field];
    }
    return safeProfile;
  }

  private async streamEntityArray<T extends { id: string }>(
    res: Response,
    key: string,
    fetch: (lastId: string | null) => Promise<T[]>,
  ): Promise<void> {
    await this.write(res, `,"${key}":`);
    await this.streamArray(res, async (emit) => {
      let lastId: string | null = null;
      while (true) {
        const batch = await fetch(lastId);
        if (batch.length === 0) break;
        const batchLastId = batch[batch.length - 1].id;
        // Defensive guard: if the cursor did not advance, stop to avoid an
        // infinite loop (e.g., a broken mock or corrupted DB page).
        if (batchLastId === lastId) break;
        for (const item of batch) {
          await emit(item);
        }
        lastId = batchLastId;
      }
    });
  }

  private async streamPinnedChannelMessages(
    userId: string,
    res: Response,
  ): Promise<void> {
    await this.streamArray(res, async (emit) => {
      let lastId: string | null = null;
      while (true) {
        const batch: Array<{ id: string } & Record<string, unknown>> =
          await this.prisma.pinnedChannelMessage.findMany({
            where: {
              pinnedByUserId: userId,
              ...(lastId ? { id: { gt: lastId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: this.BATCH_SIZE,
            select: {
              id: true,
              messageId: true,
              channelId: true,
              pinnedAt: true,
            },
          });
        if (batch.length === 0) break;
        for (const item of batch) {
          await emit(item);
        }
        lastId = batch[batch.length - 1].id;
      }
    });
  }

  private async streamPinnedDirectMessages(
    userId: string,
    res: Response,
  ): Promise<void> {
    await this.streamArray(res, async (emit) => {
      let lastId: string | null = null;
      while (true) {
        const batch: Array<{ id: string } & Record<string, unknown>> =
          await this.prisma.pinnedDirectMessage.findMany({
            where: {
              pinnedByUserId: userId,
              ...(lastId ? { id: { gt: lastId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: this.BATCH_SIZE,
            select: {
              id: true,
              messageId: true,
              conversationId: true,
              pinnedAt: true,
            },
          });
        if (batch.length === 0) break;
        for (const item of batch) {
          await emit(item);
        }
        lastId = batch[batch.length - 1].id;
      }
    });
  }

  private async streamPinnedGroupMessages(
    userId: string,
    res: Response,
  ): Promise<void> {
    await this.streamArray(res, async (emit) => {
      let lastId: string | null = null;
      while (true) {
        const batch: Array<{ id: string } & Record<string, unknown>> =
          await this.prisma.pinnedGroupMessage.findMany({
            where: {
              pinnedByUserId: userId,
              ...(lastId ? { id: { gt: lastId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: this.BATCH_SIZE,
            select: {
              id: true,
              messageId: true,
              groupId: true,
              pinnedAt: true,
            },
          });
        if (batch.length === 0) break;
        for (const item of batch) {
          await emit(item);
        }
        lastId = batch[batch.length - 1].id;
      }
    });
  }

  private async streamMessages(userId: string, res: Response): Promise<void> {
    await this.streamArray(res, async (emit) => {
      let lastId: string | null = null;
      while (true) {
        const batch: Array<{ id: string } & Record<string, unknown>> =
          await this.prisma.message.findMany({
            where: {
              authorId: userId,
              deletedAt: null,
              ...(lastId ? { id: { gt: lastId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: this.BATCH_SIZE,
            select: {
              id: true,
              channelId: true,
              content: true,
              parentId: true,
              replyToMessageId: true,
              createdAt: true,
              updatedAt: true,
              editedAt: true,
              mentions: true,
            },
          });
        if (batch.length === 0) break;
        for (const item of batch) {
          await emit(item);
        }
        lastId = batch[batch.length - 1].id;
      }
    });
  }

  private async streamDirectMessages(
    userId: string,
    res: Response,
  ): Promise<void> {
    await this.streamArray(res, async (emit) => {
      let lastId: string | null = null;
      while (true) {
        const batch: Array<{ id: string } & Record<string, unknown>> =
          await this.prisma.directMessage.findMany({
            where: {
              authorId: userId,
              deletedAt: null,
              ...(lastId ? { id: { gt: lastId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: this.BATCH_SIZE,
            select: {
              id: true,
              conversationId: true,
              content: true,
              parentId: true,
              replyToMessageId: true,
              createdAt: true,
              updatedAt: true,
              editedAt: true,
              mentions: true,
            },
          });
        if (batch.length === 0) break;
        for (const item of batch) {
          await emit(item);
        }
        lastId = batch[batch.length - 1].id;
      }
    });
  }

  private async streamGroupMessages(
    userId: string,
    res: Response,
  ): Promise<void> {
    await this.streamArray(res, async (emit) => {
      let lastId: string | null = null;
      while (true) {
        const batch: Array<{ id: string } & Record<string, unknown>> =
          await this.prisma.groupMessage.findMany({
            where: {
              authorId: userId,
              ...(lastId ? { id: { gt: lastId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: this.BATCH_SIZE,
            select: {
              id: true,
              groupId: true,
              content: true,
              replyToMessageId: true,
              createdAt: true,
              updatedAt: true,
              mentions: true,
            },
          });
        if (batch.length === 0) break;
        for (const item of batch) {
          await emit(item);
        }
        lastId = batch[batch.length - 1].id;
      }
    });
  }

  private async streamArray(
    res: Response,
    iterate: (emit: (item: JsonValue) => Promise<void>) => Promise<void>,
  ): Promise<void> {
    await this.write(res, '[');
    let first = true;
    const emit = async (item: JsonValue): Promise<void> => {
      if (!first) {
        await this.write(res, ',');
      }
      await this.write(res, JSON.stringify(item));
      first = false;
    };
    await iterate(emit);
    await this.write(res, ']');
  }
}
