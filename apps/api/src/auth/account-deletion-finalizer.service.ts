import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@lets-chat/database';
import { randomBytes } from 'crypto';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';
import { StorageService } from '../storage/storage.service';
import { AvatarUploadService } from './avatar-upload.service';

const DEFAULT_RUN_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class AccountDeletionFinalizerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AccountDeletionFinalizerService.name);
  private startupTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly avatarUpload: AvatarUploadService,
    private readonly storageService: StorageService,
  ) {}

  onModuleInit() {
    // Run once shortly after startup to handle any backlog, then periodically.
    this.startupTimer = setTimeout(() => {
      void this.run();
    }, 5000);
    this.startupTimer.unref();

    const intervalMs = this.config.get<number>(
      'ACCOUNT_DELETION_FINALIZER_INTERVAL_MS',
      DEFAULT_RUN_INTERVAL_MS,
    );
    this.intervalTimer = setInterval(() => {
      void this.run();
    }, intervalMs);
    this.intervalTimer.unref();
  }

  onModuleDestroy(): Promise<void> {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    return Promise.resolve();
  }

  async run(): Promise<{
    processedCount: number;
    cleanedAvatars: number;
    cleanedAttachments: number;
  }> {
    const now = new Date();
    const dueUsers = await this.prisma.user.findMany({
      where: {
        status: 'PENDING_DELETION',
        deletionScheduledFor: { lte: now },
      },
      select: { id: true },
    });

    let processedCount = 0;
    let cleanedAttachments = 0;
    const attemptedAttachmentCleanups = new Set<string>();
    for (const { id } of dueUsers) {
      try {
        const finalized = await this.finalizeUser(id, now);
        if (finalized) {
          processedCount++;
          attemptedAttachmentCleanups.add(id);
          cleanedAttachments += await this.cleanupAttachmentObjects(id);
        }
      } catch (error) {
        this.logger.error(
          {
            userId: id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to finalize account deletion',
        );
      }
    }

    let cleanedAvatars = 0;
    const incompleteCleanups = await this.prisma.user.findMany({
      where: {
        status: 'ANONYMIZED',
        avatarCleanupCompletedAt: null,
      },
      select: { id: true },
    });
    for (const { id } of incompleteCleanups) {
      try {
        const cleaned = await this.cleanupAvatar(id);
        if (cleaned) {
          cleanedAvatars++;
        }
      } catch (error) {
        this.logger.error(
          {
            userId: id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to retry avatar cleanup',
        );
      }
    }

    const incompleteAttachmentCleanups = await this.prisma.user.findMany({
      where: {
        status: 'ANONYMIZED',
        attachmentObjectsCleanupCompletedAt: null,
      },
      select: { id: true },
    });
    for (const { id } of incompleteAttachmentCleanups) {
      if (attemptedAttachmentCleanups.has(id)) {
        continue;
      }
      try {
        cleanedAttachments += await this.cleanupAttachmentObjects(id);
      } catch (error) {
        this.logger.error(
          {
            userId: id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to retry attachment object cleanup',
        );
      }
    }

    return { processedCount, cleanedAvatars, cleanedAttachments };
  }

  async finalizeUser(userId: string, now = new Date()): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, status: 'PENDING_DELETION' },
      select: {
        id: true,
        email: true,
        avatarUrl: true,
        deletionScheduledFor: true,
      },
    });
    if (!user) {
      return false;
    }

    // Do not touch files or PII until the grace period has actually passed.
    if (user.deletionScheduledFor && user.deletionScheduledFor > now) {
      return false;
    }

    const success = await this.prisma.$transaction(async (tx) => {
      // Conditional update acts as a DB-level claim: only one instance wins.
      const updateResult = await tx.user.updateMany({
        where: {
          id: userId,
          status: 'PENDING_DELETION',
          deletionScheduledFor: { lte: now },
        },
        data: {
          status: 'ANONYMIZED',
          deletedAt: now,
          anonymizedAt: now,
          email: `${userId}@users.invalid`,
          username: `deleted_${userId}`,
          displayName: null,
          avatarUrl: null,
          passwordHash: `!deleted!${randomBytes(32).toString('hex')}`,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
          emailVerificationSentAt: null,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          passwordResetSentAt: null,
          pendingEmail: null,
          emailChangeTokenHash: null,
          emailChangeExpiresAt: null,
          emailChangeSentAt: null,
          deletionRequestedAt: null,
          deletionScheduledFor: null,
          deletionCancellationTokenHash: null,
          deletionCancellationExpiresAt: null,
        },
      });

      if (updateResult.count === 0) {
        return false;
      }

      await tx.refreshToken.deleteMany({
        where: { userId },
      });

      await tx.pushSubscription.deleteMany({
        where: { userId },
      });

      await tx.userContact.deleteMany({
        where: { OR: [{ ownerUserId: userId }, { contactUserId: userId }] },
      });

      await tx.contactRequest.deleteMany({
        where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      });

      await tx.userBlock.deleteMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      });

      // Revoke pending invitations addressed to the email being freed.
      // This prevents a later account registered with the same address from
      // accepting invitations intended for the deleted account.
      const originalEmail = user.email;
      if (originalEmail) {
        await tx.invitation.updateMany({
          where: {
            invitedEmail: originalEmail,
            usedById: null,
            deletedAt: null,
          },
          data: { deletedAt: now },
        });
        await tx.channelInvitation.updateMany({
          where: {
            invitedEmail: originalEmail,
            usedById: null,
            deletedAt: null,
          },
          data: { deletedAt: now },
        });
      }

      // Soft-delete workspace and channel memberships.
      await tx.workspaceMember.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      });

      await tx.channelMember.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      });

      // Mark group memberships as left.
      await tx.groupMember.updateMany({
        where: { userId, leftAt: null },
        data: { leftAt: now },
      });

      // Soft-delete attachments owned by the user.
      await tx.attachment.updateMany({
        where: { createdById: userId, deletedAt: null },
        data: { deletedAt: now },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AuditAction.ACCOUNT_DELETION_FINALIZED,
          entityType: AuditEntityType.USER,
          entityId: userId,
          severity: AuditSeverity.CRITICAL,
        },
      });

      return true;
    });

    if (success) {
      // Mark avatar cleanup as pending, then attempt it. If this fails, the
      // periodic finalizer will retry for ANONYMIZED users with incomplete cleanup.
      try {
        await this.cleanupAvatar(userId);
      } catch (error) {
        this.logger.error(
          {
            userId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Avatar cleanup failed during finalization; will retry',
        );
      }
    }

    return success;
  }

  async cleanupAttachmentObjects(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        attachmentObjectsCleanupCompletedAt: true,
      },
    });
    if (
      !user ||
      user.status !== 'ANONYMIZED' ||
      user.attachmentObjectsCleanupCompletedAt
    ) {
      return 0;
    }

    let cleanedCount = 0;
    let allSucceeded = true;

    const attachments = await this.prisma.attachment.findMany({
      where: { createdById: userId },
      select: { id: true, storageKey: true },
    });

    for (const { id, storageKey } of attachments) {
      try {
        await this.storageService.deleteObject(storageKey);
        cleanedCount++;
      } catch (error) {
        if (this.isAttachmentNotFoundError(error)) {
          cleanedCount++;
          continue;
        }
        allSucceeded = false;
        this.logger.error(
          {
            userId,
            attachmentId: id,
            storageKey,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to delete attachment storage object; will retry',
        );
      }
    }

    if (!allSucceeded) {
      return cleanedCount;
    }

    try {
      const prefixCount = await this.storageService.deleteObjectsByPrefix(
        `attachments/${userId}/`,
      );
      cleanedCount += prefixCount;
    } catch (error) {
      allSucceeded = false;
      this.logger.error(
        {
          userId,
          prefix: `attachments/${userId}/`,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to delete user attachment storage prefix; will retry',
      );
      return cleanedCount;
    }

    if (allSucceeded) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { attachmentObjectsCleanupCompletedAt: new Date() },
      });
    }

    return cleanedCount;
  }

  private isAttachmentNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const err = error as Record<string, unknown>;
    if (err.name === 'NotFound' || err.name === 'NoSuchKey') return true;
    if (err.Code === 'NoSuchKey' || err.Code === 'NoSuchBucket') return true;
    const metadata = err.$metadata;
    if (typeof metadata === 'object' && metadata !== null) {
      return (metadata as Record<string, unknown>).httpStatusCode === 404;
    }
    return false;
  }

  async cleanupAvatar(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        avatarCleanupCompletedAt: true,
      },
    });
    if (
      !user ||
      user.status !== 'ANONYMIZED' ||
      user.avatarCleanupCompletedAt
    ) {
      return false;
    }

    try {
      await this.avatarUpload.deleteAllAvatarsForUser(userId);
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarCleanupCompletedAt: new Date() },
      });
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Directory already gone; mark cleanup complete idempotently.
        await this.prisma.user.update({
          where: { id: userId },
          data: { avatarCleanupCompletedAt: new Date() },
        });
        return true;
      }
      throw error;
    }
  }
}
