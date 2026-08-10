import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@lets-chat/database';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';

const DEFAULT_RUN_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class AccountDeletionFinalizerService implements OnModuleInit {
  private readonly logger = new Logger(AccountDeletionFinalizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    // Run once shortly after startup to handle any backlog, then periodically.
    setTimeout(() => {
      void this.run();
    }, 5000);

    const intervalMs = this.config.get<number>(
      'ACCOUNT_DELETION_FINALIZER_INTERVAL_MS',
      DEFAULT_RUN_INTERVAL_MS,
    );
    setInterval(() => {
      void this.run();
    }, intervalMs);
  }

  async run(): Promise<{ processedCount: number }> {
    const now = new Date();
    const dueUsers = await this.prisma.user.findMany({
      where: {
        status: 'PENDING_DELETION',
        deletionScheduledFor: { lte: now },
      },
      select: { id: true },
    });

    let processedCount = 0;
    for (const { id } of dueUsers) {
      try {
        const finalized = await this.finalizeUser(id, now);
        if (finalized) {
          processedCount++;
          await this.recordFinalizationAudit(id);
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

    return { processedCount };
  }

  async finalizeUser(userId: string, now = new Date()): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
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

      return true;
    });
  }

  async recordFinalizationAudit(userId: string): Promise<void> {
    await this.audit.record({
      actorId: userId,
      action: AuditAction.ACCOUNT_DELETION_FINALIZED,
      entityType: AuditEntityType.USER,
      entityId: userId,
      severity: AuditSeverity.CRITICAL,
    });
  }
}
