import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '@lets-chat/database';
import { PasswordService } from './password.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditEntityType,
  AuditSeverity,
} from '../audit/audit.constants';

export interface DataExportResult {
  streamed: boolean;
}

@Injectable()
export class DataExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async exportUserData(
    userId: string,
    currentPassword: string,
    res: Response,
  ): Promise<DataExportResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordValid = await this.password.verifyPassword(
      currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const exportData = await this.buildExport(userId);

    await this.audit.record({
      actorId: userId,
      action: AuditAction.USER_DATA_EXPORTED,
      entityType: AuditEntityType.USER,
      entityId: userId,
      severity: AuditSeverity.INFO,
      metadata: {
        exportFormatVersion: exportData.exportFormatVersion,
      },
    });

    const filename = `lets-chat-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200);
    res.send(JSON.stringify(exportData, null, 2));

    return { streamed: true };
  }

  private async buildExport(userId: string) {
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        interfaceLanguage: true,
        role: true,
        contactPrivacySetting: true,
        pushNotificationsEnabled: true,
        mentionNotificationsEnabled: true,
        directMessageNotificationsEnabled: true,
        groupMessageNotificationsEnabled: true,
        channelMessageNotificationsEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const safeProfile = profile as Record<string, unknown>;
    const unsafeProfileFields = [
      'passwordHash',
      'emailVerificationTokenHash',
      'passwordResetTokenHash',
      'emailChangeTokenHash',
      'deletionCancellationTokenHash',
      'refreshTokens',
    ];
    for (const field of unsafeProfileFields) {
      delete safeProfile[field];
    }

    const workspaceMemberships = await this.prisma.workspaceMember.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        createdAt: true,
        workspace: { select: { name: true, slug: true } },
      },
    });

    const channelMemberships = await this.prisma.channelMember.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        channelId: true,
        role: true,
        createdAt: true,
        channel: { select: { name: true, slug: true, type: true } },
      },
    });

    const groupMemberships = await this.prisma.groupMember.findMany({
      where: { userId, leftAt: null },
      select: {
        id: true,
        groupId: true,
        role: true,
        joinedAt: true,
        group: { select: { name: true, createdAt: true } },
      },
    });

    const messages = await this.prisma.message.findMany({
      where: { authorId: userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        channelId: true,
        content: true,
        parentId: true,
        replyToMessageId: true,
        createdAt: true,
        updatedAt: true,
        editedAt: true,
        mentions: true,
      },
      take: 10_000,
    });

    const directMessages = await this.prisma.directMessage.findMany({
      where: { authorId: userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        conversationId: true,
        content: true,
        parentId: true,
        replyToMessageId: true,
        createdAt: true,
        updatedAt: true,
        editedAt: true,
        mentions: true,
      },
      take: 10_000,
    });

    const groupMessages = await this.prisma.groupMessage.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        groupId: true,
        content: true,
        replyToMessageId: true,
        createdAt: true,
        updatedAt: true,
        mentions: true,
      },
      take: 10_000,
    });

    const reactions = await this.prisma.reaction.findMany({
      where: { userId, deletedAt: null },
      select: {
        id: true,
        messageId: true,
        emoji: true,
        createdAt: true,
      },
    });

    const directReactions = await this.prisma.directMessageReaction.findMany({
      where: { userId },
      select: {
        id: true,
        messageId: true,
        emoji: true,
        createdAt: true,
      },
    });

    const contacts = await this.prisma.userContact.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      select: {
        id: true,
        contactUserId: true,
        nickname: true,
        createdAt: true,
      },
    });

    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: userId, deletedAt: null },
      select: {
        id: true,
        blockedId: true,
        reason: true,
        createdAt: true,
      },
    });

    const reports = await this.prisma.userReport.findMany({
      where: { reporterId: userId },
      select: {
        id: true,
        reportedUserId: true,
        messageId: true,
        directConversationId: true,
        groupId: true,
        reason: true,
        details: true,
        status: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const attachments = await this.prisma.attachment.findMany({
      where: { createdById: userId, deletedAt: null },
      select: {
        id: true,
        filename: true,
        originalName: true,
        mimeType: true,
        size: true,
        storageKey: true,
        storageBackend: true,
        messageId: true,
        directMessageId: true,
        groupMessageId: true,
        createdAt: true,
      },
    });

    const sessions = await this.prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    return {
      exportFormatVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      notice:
        'Attachment binaries are not included. Download each active attachment individually before requesting account deletion.',
      profile: safeProfile,
      workspaceMemberships,
      channelMemberships,
      groupMemberships,
      messages,
      directMessages,
      groupMessages,
      reactions,
      directReactions,
      contacts,
      blocks,
      reports,
      attachments,
      sessions,
    };
  }
}
