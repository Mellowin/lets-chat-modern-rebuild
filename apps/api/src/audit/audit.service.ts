import { Injectable } from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { AuditRepository } from './audit.repository';

export interface RecordAuditInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  workspaceId?: string | null;
  channelId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  async record(input: RecordAuditInput) {
    return this.audit.create({
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      workspaceId: input.workspaceId ?? null,
      channelId: input.channelId ?? null,
      metadata: input.metadata ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  }

  async listForWorkspace(workspaceId: string, limit: number) {
    const logs = await this.audit.listForWorkspace(workspaceId, limit);
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      workspaceId: log.workspaceId,
      channelId: log.channelId,
      metadata: log.metadata,
      createdAt: log.createdAt,
      actor: log.actor
        ? {
            id: log.actor.id,
            username: log.actor.username,
          }
        : null,
    }));
  }
}
