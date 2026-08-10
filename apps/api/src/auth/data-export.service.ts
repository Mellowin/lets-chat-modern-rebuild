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
    const workspaceMemberships = await this.loadWorkspaceMemberships(userId);
    const channelMemberships = await this.loadChannelMemberships(userId);
    const groupMemberships = await this.loadGroupMemberships(userId);
    const createdWorkspaces = await this.loadCreatedWorkspaces(userId);
    const createdChannels = await this.loadCreatedChannels(userId);
    const createdGroups = await this.loadCreatedGroups(userId);
    const reactions = await this.loadReactions(userId);
    const directReactions = await this.loadDirectReactions(userId);
    const contacts = await this.loadContacts(userId);
    const blocks = await this.loadBlocks(userId);
    const reports = await this.loadReports(userId);
    const attachments = await this.loadAttachments(userId);
    const sessions = await this.loadSessions(userId);

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
    await this.writeJsonObjectField(
      res,
      'workspaceMemberships',
      workspaceMemberships,
      false,
    );
    await this.writeJsonObjectField(
      res,
      'channelMemberships',
      channelMemberships,
      false,
    );
    await this.writeJsonObjectField(
      res,
      'groupMemberships',
      groupMemberships,
      false,
    );
    await this.writeJsonObjectField(
      res,
      'createdWorkspaces',
      createdWorkspaces,
      false,
    );
    await this.writeJsonObjectField(
      res,
      'createdChannels',
      createdChannels,
      false,
    );
    await this.writeJsonObjectField(res, 'createdGroups', createdGroups, false);
    await this.writeJsonObjectField(res, 'reactions', reactions, false);
    await this.writeJsonObjectField(
      res,
      'directReactions',
      directReactions,
      false,
    );
    await this.writeJsonObjectField(res, 'contacts', contacts, false);
    await this.writeJsonObjectField(res, 'blocks', blocks, false);
    await this.writeJsonObjectField(res, 'reports', reports, false);
    await this.writeJsonObjectField(res, 'attachments', attachments, false);
    await this.writeJsonObjectField(res, 'sessions', sessions, false);

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

  private loadWorkspaceMemberships(userId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        createdAt: true,
        workspace: { select: { name: true, slug: true } },
      },
    });
  }

  private loadChannelMemberships(userId: string) {
    return this.prisma.channelMember.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        channelId: true,
        role: true,
        createdAt: true,
        channel: { select: { name: true, slug: true, type: true } },
      },
    });
  }

  private loadGroupMemberships(userId: string) {
    return this.prisma.groupMember.findMany({
      where: { userId, leftAt: null },
      select: {
        id: true,
        groupId: true,
        role: true,
        joinedAt: true,
        group: { select: { name: true, createdAt: true } },
      },
    });
  }

  private loadCreatedWorkspaces(userId: string) {
    return this.prisma.workspace.findMany({
      where: { ownerId: userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private loadCreatedChannels(userId: string) {
    return this.prisma.channel.findMany({
      where: { createdById: userId, deletedAt: null },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        slug: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private loadCreatedGroups(userId: string) {
    return this.prisma.groupConversation.findMany({
      where: { createdById: userId, archivedAt: null },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private loadReactions(userId: string) {
    return this.prisma.reaction.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        messageId: true,
        emoji: true,
        createdAt: true,
      },
    });
  }

  private loadDirectReactions(userId: string) {
    return this.prisma.directMessageReaction.findMany({
      where: { userId },
      select: {
        id: true,
        messageId: true,
        emoji: true,
        createdAt: true,
      },
    });
  }

  private loadContacts(userId: string) {
    return this.prisma.userContact.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      select: {
        id: true,
        contactUserId: true,
        nickname: true,
        createdAt: true,
      },
    });
  }

  private loadBlocks(userId: string) {
    return this.prisma.userBlock.findMany({
      where: { blockerId: userId, deletedAt: null },
      select: {
        id: true,
        blockedId: true,
        reason: true,
        createdAt: true,
      },
    });
  }

  private loadReports(userId: string) {
    return this.prisma.userReport.findMany({
      where: { reporterId: userId },
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
    });
  }

  private loadAttachments(userId: string) {
    return this.prisma.attachment.findMany({
      where: { createdById: userId, deletedAt: null },
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
    });
  }

  private loadSessions(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        ipAddress: true,
        userAgent: true,
      },
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
