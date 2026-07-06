import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lets-chat/database';

export interface AdminAuditListOptions {
  limit: number;
  cursor?: { createdAt: Date; id: string };
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

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AuditLogUncheckedCreateInput) {
    return this.prisma.auditLog.create({ data });
  }

  async listForWorkspace(workspaceId: string, limit: number) {
    return this.prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }

  async listForAdmin(options: AdminAuditListOptions) {
    const where: Prisma.AuditLogWhereInput = {};

    if (options.actorUserId) {
      where.actorId = options.actorUserId;
    }
    if (options.targetUserId) {
      where.targetUserId = options.targetUserId;
    }
    if (options.workspaceId) {
      where.workspaceId = options.workspaceId;
    }
    if (options.channelId) {
      where.channelId = options.channelId;
    }
    if (options.groupId) {
      where.groupId = options.groupId;
    }
    if (options.action) {
      where.action = options.action;
    }
    if (options.entityType) {
      where.entityType = options.entityType;
    }
    if (options.severity) {
      where.severity = options.severity;
    }
    if (options.dateFrom || options.dateTo) {
      where.createdAt = {};
      if (options.dateFrom) {
        where.createdAt.gte = new Date(options.dateFrom);
      }
      if (options.dateTo) {
        where.createdAt.lte = new Date(options.dateTo);
      }
    }

    if (options.cursor) {
      where.OR = [
        { createdAt: { lt: options.cursor.createdAt } },
        {
          createdAt: options.cursor.createdAt,
          id: { lt: options.cursor.id },
        },
      ];
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit,
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        targetUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    const hasMore = logs.length === options.limit;

    return { logs, hasMore };
  }

  async findById(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        targetUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });
  }
}
