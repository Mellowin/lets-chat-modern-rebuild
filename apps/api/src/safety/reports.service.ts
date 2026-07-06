import {
  BadRequestException,
  Injectable,
  Inject,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';
import { UsersRepository } from '../users/users.repository';
import { ReportsRepository } from './reports.repository';
import { CreateReportDto } from './dto/create-report.dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';

@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly users: UsersRepository,
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(AuditService)
    private readonly audit: AuditService | null = null,
  ) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
    if (reporterId === dto.reportedUserId) {
      throw new BadRequestException('Cannot report yourself');
    }

    if (
      !dto.reason ||
      typeof dto.reason !== 'string' ||
      dto.reason.trim().length === 0
    ) {
      throw new BadRequestException('Reason is required');
    }

    const reportedUser = await this.users.findById(dto.reportedUserId);
    if (!reportedUser) {
      throw new NotFoundException('User not found');
    }

    if (dto.messageId) {
      const message = await this.findReportableMessage(
        dto.messageId,
        dto.directConversationId,
        dto.groupId,
      );
      if (!message) {
        throw new NotFoundException('Message not found');
      }
      if (message.authorId !== dto.reportedUserId) {
        throw new BadRequestException(
          'Message does not belong to reported user',
        );
      }
    }

    const report = await this.reports.createReport({
      reporterId,
      reportedUserId: dto.reportedUserId,
      messageId: dto.messageId,
      directConversationId: dto.directConversationId,
      groupId: dto.groupId,
      reason: dto.reason,
      details: dto.details,
    });

    await this.audit?.record({
      actorId: reporterId,
      targetUserId: dto.reportedUserId,
      action: AuditAction.REPORT_CREATED,
      entityType: AuditEntityType.USER_REPORT,
      entityId: report.id,
      severity: AuditSeverity.WARNING,
      metadata: {
        reason: dto.reason,
        messageId: dto.messageId ?? null,
        directConversationId: dto.directConversationId ?? null,
        groupId: dto.groupId ?? null,
      },
    });

    return report;
  }

  private async findReportableMessage(
    messageId: string,
    directConversationId?: string,
    groupId?: string,
  ) {
    if (directConversationId) {
      return this.prisma.directMessage.findFirst({
        where: {
          id: messageId,
          conversationId: directConversationId,
          deletedAt: null,
        },
        select: { authorId: true },
      });
    }

    if (groupId) {
      return this.prisma.groupMessage.findFirst({
        where: {
          id: messageId,
          groupId,
        },
        select: { authorId: true },
      });
    }

    const directMessage = await this.prisma.directMessage.findFirst({
      where: {
        id: messageId,
        deletedAt: null,
      },
      select: { authorId: true },
    });
    if (directMessage) return directMessage;

    return this.prisma.groupMessage.findFirst({
      where: {
        id: messageId,
      },
      select: { authorId: true },
    });
  }
}
