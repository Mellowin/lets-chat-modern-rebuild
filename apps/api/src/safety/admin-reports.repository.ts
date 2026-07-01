import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lets-chat/database';

export type AdminReportListItem = Awaited<
  ReturnType<AdminReportsRepository['findManyAdminReports']>
>[number];

export interface AdminReportFilters {
  status?: string;
  cursor?: { createdAt: Date; id: string } | null;
  limit: number;
}

const safeUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const satisfies Prisma.UserSelect;

@Injectable()
export class AdminReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findManyAdminReports(filters: AdminReportFilters) {
    const where: Prisma.UserReportWhereInput = {};
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.cursor) {
      where.OR = [
        { createdAt: { lt: filters.cursor.createdAt } },
        {
          createdAt: filters.cursor.createdAt,
          id: { lt: filters.cursor.id },
        },
      ];
    }

    return this.prisma.userReport.findMany({
      where,
      take: filters.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        reporterId: true,
        reportedUserId: true,
        messageId: true,
        directConversationId: true,
        groupId: true,
        reason: true,
        details: true,
        status: true,
        adminNote: true,
        reviewedAt: true,
        reviewedBy: true,
        createdAt: true,
        updatedAt: true,
        reporter: { select: safeUserSelect },
        reportedUser: { select: safeUserSelect },
        reviewedByUser: { select: safeUserSelect },
      },
    });
  }

  async countAdminReports(status?: string) {
    const where: Prisma.UserReportWhereInput = {};
    if (status) {
      where.status = status;
    }
    return this.prisma.userReport.count({ where });
  }

  async findAdminReportById(id: string) {
    return this.prisma.userReport.findUnique({
      where: { id },
      select: {
        id: true,
        reporterId: true,
        reportedUserId: true,
        messageId: true,
        directConversationId: true,
        groupId: true,
        reason: true,
        details: true,
        status: true,
        adminNote: true,
        reviewedAt: true,
        reviewedBy: true,
        createdAt: true,
        updatedAt: true,
        reporter: { select: safeUserSelect },
        reportedUser: { select: safeUserSelect },
        reviewedByUser: { select: safeUserSelect },
      },
    });
  }

  async updateAdminReport(
    id: string,
    data: {
      status?: string;
      adminNote?: string | null;
      reviewedAt?: Date;
      reviewedBy?: string;
    },
  ) {
    return this.prisma.userReport.update({
      where: { id },
      data,
      select: {
        id: true,
        reporterId: true,
        reportedUserId: true,
        messageId: true,
        directConversationId: true,
        groupId: true,
        reason: true,
        details: true,
        status: true,
        adminNote: true,
        reviewedAt: true,
        reviewedBy: true,
        createdAt: true,
        updatedAt: true,
        reporter: { select: safeUserSelect },
        reportedUser: { select: safeUserSelect },
        reviewedByUser: { select: safeUserSelect },
      },
    });
  }
}
