import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createHash, randomBytes } from 'crypto';
import { UsersRepository } from '../users/users.repository';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { PasswordService } from './password.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { AccountDeletionIdempotencyService } from './account-deletion-idempotency.service';

export interface AccountDeletionBlocker {
  ownedWorkspaces: Array<{ id: string; name: string; slug: string }>;
  soleOwnedGroups: Array<{ id: string; name: string; memberId: string }>;
}

export interface RequestAccountDeletionResult {
  scheduledFor: Date;
}

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly password: PasswordService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly moduleRef: ModuleRef,
    private readonly idempotency: AccountDeletionIdempotencyService,
  ) {}

  async requestAccountDeletion(
    userId: string,
    currentPassword: string,
    confirmationPhrase: string,
    idempotencyKey?: string,
  ): Promise<RequestAccountDeletionResult> {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const bodyHash = this.hashRequestBody({
      currentPassword,
      confirmationPhrase,
    });

    return this.idempotency.run(idempotencyKey, userId, bodyHash, () =>
      this.performRequestAccountDeletion(
        userId,
        currentPassword,
        confirmationPhrase,
      ),
    );
  }

  private async performRequestAccountDeletion(
    userId: string,
    currentPassword: string,
    confirmationPhrase: string,
  ): Promise<RequestAccountDeletionResult> {
    if (confirmationPhrase !== 'DELETE MY ACCOUNT') {
      throw new ForbiddenException('Invalid confirmation phrase');
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status === 'PENDING_DELETION') {
      // Idempotent replay: return the previously scheduled deletion time without
      // generating a new token or sending another email. This branch also covers
      // retries after a successful operation when the idempotency row is already stored.
      if (!user.deletionScheduledFor) {
        throw new NotFoundException('User not found');
      }
      return { scheduledFor: user.deletionScheduledFor };
    }

    if (user.status !== 'ACTIVE') {
      throw new NotFoundException('User not found');
    }

    const passwordValid = await this.password.verifyPassword(
      currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const ownedWorkspaces =
      await this.users.findActiveWorkspaceOwnerships(userId);
    const soleOwnedGroups =
      await this.users.findActiveGroupsWhereUserIsOnlyOwner(userId);

    if (ownedWorkspaces.length > 0 || soleOwnedGroups.length > 0) {
      throw new ForbiddenException({
        message:
          'Transfer workspace and group ownership before deleting your account',
        blockers: {
          ownedWorkspaces,
          soleOwnedGroups,
        },
      });
    }

    const rawToken = this.generateDeletionToken();
    const tokenHash = this.hashDeletionToken(rawToken);
    const scheduledFor = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.users.requestAccountDeletion(userId, tokenHash, scheduledFor);

    try {
      await this.audit.record({
        actorId: userId,
        action: AuditAction.ACCOUNT_DELETION_REQUESTED,
        entityType: AuditEntityType.USER,
        entityId: userId,
        severity: AuditSeverity.CRITICAL,
        metadata: {
          scheduledFor: scheduledFor.toISOString(),
        },
      });

      await this.mail.sendAccountDeletionCancellationEmail({
        to: user.email,
        token: rawToken,
      });
    } catch (error) {
      await this.rollbackAccountDeletionRequest(userId, error);
      throw error;
    }

    // Deletion request is committed; these side effects are best-effort and
    // must not roll back the request if they fail.
    try {
      await this.refreshTokens.revokeAllForUser(userId);

      // Remove all push subscriptions so deleted accounts stop receiving pushes.
      await this.users.deletePushSubscriptionsForUser(userId);

      this.disconnectUserSockets(userId);
    } catch (error) {
      this.logger.error(
        {
          userId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to clean up account-deletion side effects; continuing',
      );
    }

    return { scheduledFor };
  }

  private hashRequestBody(body: {
    currentPassword: string;
    confirmationPhrase: string;
  }): string {
    return createHash('sha256').update(JSON.stringify(body)).digest('hex');
  }

  private async rollbackAccountDeletionRequest(
    userId: string,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.users.clearDeletionRequest(userId);
    } catch (rollbackError) {
      // If the rollback itself fails, the user could remain stuck in
      // PENDING_DELETION without a cancellation token. Log both errors and
      // throw the rollback failure so callers know the state is unsafe.
      const rollbackMessage =
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
      const originalMessage =
        originalError instanceof Error
          ? originalError.message
          : String(originalError);
      throw new Error(
        `Account deletion request failed and rollback also failed. ` +
          `Original: ${originalMessage}; Rollback: ${rollbackMessage}`,
      );
    }
  }

  async resendAccountDeletionCancellation(
    email: string,
    currentPassword: string,
  ): Promise<{ success: boolean }> {
    const user = await this.users.findByEmail(email);

    // Generic public response for all non-matching or non-pending cases.
    if (!user || user.status !== 'PENDING_DELETION') {
      return { success: true };
    }

    const passwordValid = await this.password.verifyPassword(
      currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      return { success: true };
    }

    if (!user.deletionScheduledFor) {
      return { success: true };
    }

    const oldTokenHash = user.deletionCancellationTokenHash;
    const rawToken = this.generateDeletionToken();
    const newTokenHash = this.hashDeletionToken(rawToken);

    try {
      await this.users.updateDeletionCancellationToken(
        user.id,
        newTokenHash,
        user.deletionScheduledFor,
      );

      await this.audit.record({
        actorId: user.id,
        action: AuditAction.ACCOUNT_DELETION_CANCELLATION_RESENT,
        entityType: AuditEntityType.USER,
        entityId: user.id,
        severity: AuditSeverity.CRITICAL,
      });

      await this.mail.sendAccountDeletionCancellationEmail({
        to: user.email,
        token: rawToken,
      });
    } catch (error) {
      // Restore the previous cancellation token so a mail failure does not leave
      // the user without a working cancellation path. If the old token was expired,
      // the user can retry this endpoint again.
      await this.users
        .updateDeletionCancellationToken(
          user.id,
          oldTokenHash,
          user.deletionScheduledFor,
        )
        .catch(() => {
          // Best-effort restore; if this also fails, the recovery message below
          // is the only actionable signal left.
        });
      throw error;
    }

    return { success: true };
  }

  async cancelAccountDeletion(token: string): Promise<{ success: boolean }> {
    const tokenHash = this.hashDeletionToken(token);
    const user =
      await this.users.findByDeletionCancellationTokenHash(tokenHash);

    if (
      !user ||
      user.status !== 'PENDING_DELETION' ||
      !user.deletionCancellationExpiresAt ||
      user.deletionCancellationExpiresAt < new Date()
    ) {
      throw new NotFoundException(
        'Invalid or expired account deletion cancellation link',
      );
    }

    await this.users.clearDeletionRequest(user.id);

    await this.audit.record({
      actorId: user.id,
      action: AuditAction.ACCOUNT_DELETION_CANCELLED,
      entityType: AuditEntityType.USER,
      entityId: user.id,
      severity: AuditSeverity.CRITICAL,
    });

    await this.mail.sendAccountDeletionCancelledConfirmationEmail({
      to: user.email,
    });

    return { success: true };
  }

  private disconnectUserSockets(userId: string): void {
    try {
      const websocketEvents = this.moduleRef.get(WebsocketEventsService, {
        strict: false,
      });
      websocketEvents.disconnectUser(userId);
    } catch {
      // WebsocketEventsService may not be available during unit tests or
      // if the websocket module is not loaded. Disconnect is best-effort here.
    }
  }

  private generateDeletionToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashDeletionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
