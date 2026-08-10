import {
  ForbiddenException,
  Injectable,
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

export interface AccountDeletionBlocker {
  ownedWorkspaces: Array<{ id: string; name: string; slug: string }>;
  soleOwnedGroups: Array<{ id: string; name: string; memberId: string }>;
}

export interface RequestAccountDeletionResult {
  scheduledFor: Date;
}

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly password: PasswordService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async requestAccountDeletion(
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
      // generating a new token or sending another email.
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

    await this.refreshTokens.revokeAllForUser(userId);

    // Remove all push subscriptions so deleted accounts stop receiving pushes.
    await this.users.deletePushSubscriptionsForUser(userId);

    this.disconnectUserSockets(userId);

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

    return { scheduledFor };
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
