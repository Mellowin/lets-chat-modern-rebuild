import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lets-chat/database';

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
          },
        },
      },
    });
  }
}
