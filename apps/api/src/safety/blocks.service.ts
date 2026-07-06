import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Inject,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { BlocksRepository } from './blocks.repository';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';

@Injectable()
export class BlocksService {
  constructor(
    private readonly blocks: BlocksRepository,
    private readonly users: UsersRepository,
    @Optional()
    @Inject(AuditService)
    private readonly audit: AuditService | null = null,
  ) {}

  async block(
    blockerId: string,
    blockedId: string,
    reason?: string,
  ): Promise<{
    id: string;
    blockerId: string;
    blockedUserId: string;
    reason: string | null;
    createdAt: Date;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  }> {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const targetUser = await this.users.findById(blockedId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const block = await this.blocks.upsertBlock(blockerId, blockedId, reason);

    await this.audit?.record({
      actorId: blockerId,
      targetUserId: blockedId,
      action: AuditAction.USER_BLOCKED,
      entityType: AuditEntityType.USER_BLOCK,
      entityId: block.id,
      severity: AuditSeverity.WARNING,
      metadata: { reason: reason ?? null },
    });

    return {
      id: block.id,
      blockerId: block.blockerId,
      blockedUserId: block.blockedId,
      reason: block.reason,
      createdAt: block.createdAt,
      username: block.blocked.username,
      displayName: block.blocked.displayName,
      avatarUrl: block.blocked.avatarUrl,
    };
  }

  async unblock(
    blockerId: string,
    blockedId: string,
  ): Promise<{ success: boolean }> {
    const deletedCount = await this.blocks.softDeleteBlock(
      blockerId,
      blockedId,
    );
    if (deletedCount === 0) {
      throw new NotFoundException('Block not found');
    }

    await this.audit?.record({
      actorId: blockerId,
      targetUserId: blockedId,
      action: AuditAction.USER_UNBLOCKED,
      entityType: AuditEntityType.USER_BLOCK,
      entityId: blockedId,
      severity: AuditSeverity.INFO,
    });

    return { success: true };
  }

  async findBlockerIdsWhoBlockedUser(blockedId: string): Promise<string[]> {
    return this.blocks.findBlockerIdsWhoBlockedUser(blockedId);
  }

  async listBlockedUsers(blockerId: string) {
    const blocks = await this.blocks.findActiveByBlocker(blockerId);
    return blocks.map((block) => ({
      id: block.id,
      blockerId: block.blockerId,
      blockedUserId: block.blockedId,
      reason: block.reason,
      createdAt: block.createdAt,
      username: block.blocked.username,
      displayName: block.blocked.displayName,
      avatarUrl: block.blocked.avatarUrl,
    }));
  }

  async findActiveBlock(blockerId: string, blockedId: string) {
    return this.blocks.findActiveBlock(blockerId, blockedId);
  }

  async hasBlockInEitherDirection(
    userAId: string,
    userBId: string,
  ): Promise<boolean> {
    const block = await this.blocks.findActiveBlockInEitherDirection(
      userAId,
      userBId,
    );
    return !!block;
  }

  async isBlockedBy(
    targetUserId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const block = await this.blocks.findActiveBlock(targetUserId, actorUserId);
    return !!block;
  }

  async requireNoBlockInEitherDirection(
    userAId: string,
    userBId: string,
    errorMessage = 'Action not allowed',
  ): Promise<void> {
    const blocked = await this.hasBlockInEitherDirection(userAId, userBId);
    if (blocked) {
      throw new ForbiddenException(errorMessage);
    }
  }
}
