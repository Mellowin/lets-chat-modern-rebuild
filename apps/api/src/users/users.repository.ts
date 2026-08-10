import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lets-chat/database';

interface CreateUserInput {
  email: string;
  username: string;
  passwordHash: string;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeUsername(value: string): string {
    return value.trim().toLowerCase();
  }

  private trimUsername(value: string): string {
    return value.trim();
  }

  private activeWhere() {
    return { status: 'ACTIVE' as const };
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findActiveById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, ...this.activeWhere() },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: this.normalizeEmail(email) },
    });
  }

  async findActiveByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: {
        email: this.normalizeEmail(email),
        ...this.activeWhere(),
      },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: {
        username: {
          equals: this.normalizeUsername(username),
          mode: 'insensitive',
        },
      },
    });
  }

  async findActiveByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: {
        username: {
          equals: this.normalizeUsername(username),
          mode: 'insensitive',
        },
        ...this.activeWhere(),
      },
    });
  }

  async createUser(input: CreateUserInput) {
    return this.prisma.user.create({
      data: {
        email: this.normalizeEmail(input.email),
        username: this.trimUsername(input.username),
        passwordHash: input.passwordHash,
      },
    });
  }

  async deleteUser(userId: string) {
    return this.prisma.user.delete({
      where: { id: userId },
    });
  }

  async search(query: string, excludeUserId: string) {
    const trimmed = query.trim();
    const lower = trimmed.toLowerCase();
    return this.prisma.user.findMany({
      where: {
        id: { not: excludeUserId },
        OR: [
          {
            username: {
              contains: lower,
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: lower,
              mode: 'insensitive',
            },
          },
        ],
      },
      take: 20,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        contactPrivacySetting: true,
      },
    });
  }

  async updateDisplayName(userId: string, displayName: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { displayName },
    });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl, avatarUpdatedAt: new Date() },
    });
  }

  async updateInterfaceLanguage(userId: string, interfaceLanguage: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { interfaceLanguage },
    });
  }

  async findByUsernames(usernames: string[]) {
    if (usernames.length === 0) return [];
    const normalized = Array.from(
      new Set(usernames.map((u) => this.normalizeUsername(u))),
    );
    return this.prisma.user.findMany({
      where: {
        username: {
          in: normalized,
          mode: 'insensitive',
        },
      },
    });
  }

  async updateNotificationPreferences(
    userId: string,
    preferences: Partial<{
      pushNotificationsEnabled: boolean;
      mentionNotificationsEnabled: boolean;
      directMessageNotificationsEnabled: boolean;
      groupMessageNotificationsEnabled: boolean;
      channelMessageNotificationsEnabled: boolean;
    }>,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: preferences,
    });
  }

  async findByEmailVerificationTokenHash(tokenHash: string) {
    return this.prisma.user.findFirst({
      where: { emailVerificationTokenHash: tokenHash },
    });
  }

  async updateEmailVerificationToken(
    userId: string,
    tokenHash: string | null,
    expiresAt: Date | null,
    sentAt: Date | null,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: expiresAt,
        emailVerificationSentAt: sentAt,
      },
    });
  }

  async markEmailVerified(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationSentAt: null,
      },
    });
  }

  async findByPasswordResetTokenHash(tokenHash: string) {
    return this.prisma.user.findFirst({
      where: { passwordResetTokenHash: tokenHash },
    });
  }

  async updatePasswordResetToken(
    userId: string,
    tokenHash: string | null,
    expiresAt: Date | null,
    sentAt: Date | null,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
        passwordResetSentAt: sentAt,
      },
    });
  }

  async clearPasswordResetToken(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        passwordResetSentAt: null,
      },
    });
  }

  async updatePassword(userId: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async findByEmailChangeTokenHash(tokenHash: string) {
    return this.prisma.user.findFirst({
      where: { emailChangeTokenHash: tokenHash },
    });
  }

  async updateEmailChangeToken(
    userId: string,
    pendingEmail: string | null,
    tokenHash: string | null,
    expiresAt: Date | null,
    sentAt: Date | null,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail,
        emailChangeTokenHash: tokenHash,
        emailChangeExpiresAt: expiresAt,
        emailChangeSentAt: sentAt,
      },
    });
  }

  async clearEmailChangeToken(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: null,
        emailChangeTokenHash: null,
        emailChangeExpiresAt: null,
        emailChangeSentAt: null,
      },
    });
  }

  async updateEmail(userId: string, email: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { email: this.normalizeEmail(email), emailVerifiedAt: new Date() },
    });
  }

  async updateContactPrivacySetting(
    userId: string,
    contactPrivacySetting: 'EVERYONE' | 'REQUESTS_ONLY' | 'NOBODY',
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { contactPrivacySetting },
    });
  }

  async findByDeletionCancellationTokenHash(tokenHash: string) {
    return this.prisma.user.findFirst({
      where: {
        deletionCancellationTokenHash: tokenHash,
        status: 'PENDING_DELETION',
      },
    });
  }

  async findActiveWorkspaceOwnerships(userId: string) {
    return this.prisma.workspace.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
        permanentlyDeletedAt: null,
      },
      select: { id: true, name: true, slug: true },
    });
  }

  async deletePushSubscriptionsForUser(userId: string) {
    return this.prisma.pushSubscription.deleteMany({
      where: { userId },
    });
  }

  async findActiveGroupsWhereUserIsOnlyOwner(userId: string) {
    const groups = await this.prisma.groupConversation.findMany({
      where: {
        archivedAt: null,
        members: {
          some: {
            userId,
            role: 'OWNER',
            leftAt: null,
          },
        },
      },
      include: {
        members: {
          where: { leftAt: null },
          select: { id: true, userId: true, role: true },
        },
      },
    });

    return groups
      .filter((group) => {
        const owners = group.members.filter((m) => m.role === 'OWNER');
        return owners.length === 1 && owners[0].userId === userId;
      })
      .map((group) => ({
        id: group.id,
        name: group.name,
        memberId: group.members.find((m) => m.userId === userId)!.id,
      }));
  }

  async findPendingDeletionUsersDueForFinalization(now: Date) {
    return this.prisma.user.findMany({
      where: {
        status: 'PENDING_DELETION',
        deletionScheduledFor: { lte: now },
      },
    });
  }

  async requestAccountDeletion(
    userId: string,
    tokenHash: string,
    scheduledFor: Date,
  ) {
    return this.prisma.user.update({
      where: { id: userId, status: 'ACTIVE' },
      data: {
        status: 'PENDING_DELETION',
        deletionRequestedAt: new Date(),
        deletionScheduledFor: scheduledFor,
        deletionCancellationTokenHash: tokenHash,
        deletionCancellationExpiresAt: scheduledFor,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationSentAt: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        passwordResetSentAt: null,
        pendingEmail: null,
        emailChangeTokenHash: null,
        emailChangeExpiresAt: null,
        emailChangeSentAt: null,
      },
    });
  }

  async clearDeletionRequest(userId: string) {
    return this.prisma.user.update({
      where: { id: userId, status: 'PENDING_DELETION' },
      data: {
        status: 'ACTIVE',
        deletionRequestedAt: null,
        deletionScheduledFor: null,
        deletionCancellationTokenHash: null,
        deletionCancellationExpiresAt: null,
        deletedAt: null,
      },
    });
  }

  async anonymizeUser(
    userId: string,
    anonymizedEmail: string,
    anonymizedUsername: string,
    invalidPasswordHash: string,
  ) {
    return this.prisma.user.update({
      where: { id: userId, status: 'PENDING_DELETION' },
      data: {
        status: 'ANONYMIZED',
        deletedAt: new Date(),
        anonymizedAt: new Date(),
        email: anonymizedEmail,
        username: anonymizedUsername,
        displayName: null,
        avatarUrl: null,
        passwordHash: invalidPasswordHash,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationSentAt: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        passwordResetSentAt: null,
        pendingEmail: null,
        emailChangeTokenHash: null,
        emailChangeExpiresAt: null,
        emailChangeSentAt: null,
        deletionRequestedAt: null,
        deletionScheduledFor: null,
        deletionCancellationTokenHash: null,
        deletionCancellationExpiresAt: null,
      },
    });
  }
}
