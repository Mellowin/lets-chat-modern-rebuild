import { Injectable } from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { AuditRepository } from './audit.repository';
import {
  AuditSeverity,
  type AuditAction,
  type AuditEntityType,
} from './audit.constants';

export type AuditSeverityValue =
  (typeof AuditSeverity)[keyof typeof AuditSeverity];
export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];
export type AuditEntityTypeValue =
  (typeof AuditEntityType)[keyof typeof AuditEntityType];

export interface RecordAuditInput {
  actorId?: string | null;
  targetUserId?: string | null;
  action: AuditActionValue;
  entityType: AuditEntityTypeValue;
  entityId: string;
  workspaceId?: string | null;
  channelId?: string | null;
  groupId?: string | null;
  severity?: AuditSeverityValue;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue | Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditListFilters {
  cursor?: string;
  limit?: number;
  actorUserId?: string;
  targetUserId?: string;
  workspaceId?: string;
  channelId?: string;
  groupId?: string;
  action?: string;
  entityType?: string;
  severity?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditListResult {
  items: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    severity: string;
    actor: {
      id: string;
      username: string;
      displayName: string | null;
    } | null;
    targetUser: {
      id: string;
      username: string;
      displayName: string | null;
    } | null;
    workspaceId: string | null;
    channelId: string | null;
    groupId: string | null;
    requestId: string | null;
    metadata: Prisma.JsonValue | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'session',
  'apiKey',
  'apikey',
  'privateKey',
  'privatekey',
  'databaseUrl',
  'databaseurl',
  'redisUrl',
  'redisurl',
  'vapid',
  's3Secret',
  's3secret',
  'accessToken',
  'accesstoken',
  'refreshToken',
  'refreshtoken',
];

function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    lowerKey.includes(pattern.toLowerCase()),
  );
}

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeAuditMetadata);
  }

  if (typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeAuditMetadata(val);
    }
  }

  return result;
}

@Injectable()
export class AuditService {
  constructor(private readonly audit: AuditRepository) {}

  async record(input: RecordAuditInput) {
    return this.audit.create({
      actorId: input.actorId ?? null,
      targetUserId: input.targetUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      workspaceId: input.workspaceId ?? null,
      channelId: input.channelId ?? null,
      groupId: input.groupId ?? null,
      severity: input.severity ?? AuditSeverity.INFO,
      requestId: input.requestId ?? null,
      metadata: sanitizeAuditMetadata(input.metadata ?? null) as
        | Prisma.InputJsonValue
        | undefined,
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
            displayName: log.actor.displayName ?? null,
          }
        : null,
    }));
  }

  async listAdmin(options: AuditListFilters = {}): Promise<AuditListResult> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const cursor = options.cursor
      ? this.decodeCursor(options.cursor)
      : undefined;

    const { logs, hasMore } = await this.audit.listForAdmin({
      ...options,
      limit: limit + 1,
      cursor,
    });

    const trimmed = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore
      ? this.encodeCursor(trimmed[trimmed.length - 1])
      : null;

    return {
      items: trimmed.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        severity: log.severity,
        actor: log.actor
          ? {
              id: log.actor.id,
              username: log.actor.username,
              displayName: log.actor.displayName ?? null,
            }
          : null,
        targetUser: log.targetUser
          ? {
              id: log.targetUser.id,
              username: log.targetUser.username,
              displayName: log.targetUser.displayName ?? null,
            }
          : null,
        workspaceId: log.workspaceId,
        channelId: log.channelId,
        groupId: log.groupId,
        requestId: log.requestId,
        metadata: log.metadata,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      })),
      nextCursor,
      hasMore,
    };
  }

  async findById(id: string) {
    const log = await this.audit.findById(id);
    if (!log) {
      return null;
    }
    return {
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      severity: log.severity,
      actor: log.actor
        ? {
            id: log.actor.id,
            username: log.actor.username,
            displayName: log.actor.displayName ?? null,
          }
        : null,
      targetUser: log.targetUser
        ? {
            id: log.targetUser.id,
            username: log.targetUser.username,
            displayName: log.targetUser.displayName ?? null,
          }
        : null,
      workspaceId: log.workspaceId,
      channelId: log.channelId,
      groupId: log.groupId,
      requestId: log.requestId,
      metadata: log.metadata,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
    };
  }

  private encodeCursor(item: { createdAt: Date; id: string }): string {
    const payload = JSON.stringify({
      createdAt: item.createdAt.toISOString(),
      id: item.id,
    });
    return Buffer.from(payload).toString('base64url');
  }

  private decodeCursor(
    cursor: string,
  ): { createdAt: Date; id: string } | undefined {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
      return { createdAt: new Date(parsed.createdAt), id: parsed.id };
    } catch {
      return undefined;
    }
  }
}
