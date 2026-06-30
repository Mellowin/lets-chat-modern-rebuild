import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

export interface CreateReportInput {
  reporterId: string;
  reportedUserId: string;
  messageId?: string;
  directConversationId?: string;
  groupId?: string;
  reason: string;
  details?: string;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(input: CreateReportInput) {
    return this.prisma.userReport.create({
      data: {
        reporterId: input.reporterId,
        reportedUserId: input.reportedUserId,
        messageId: input.messageId ?? null,
        directConversationId: input.directConversationId ?? null,
        groupId: input.groupId ?? null,
        reason: input.reason,
        details: input.details ?? null,
      },
    });
  }
}
