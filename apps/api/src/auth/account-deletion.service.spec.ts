import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@lets-chat/database';
import { PrismaService } from '@lets-chat/database';
import {
  AccountDeletionService,
  RequestAccountDeletionResult,
} from './account-deletion.service';
import { UsersRepository } from '../users/users.repository';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { PasswordService } from './password.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { WebsocketEventsService } from '../websocket/websocket-events.service';
import { AccountDeletionIdempotencyService } from './account-deletion-idempotency.service';

const mockTx = {
  user: {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({}),
  },
};

describe('AccountDeletionService', () => {
  let service: AccountDeletionService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let refreshTokensRepository: jest.Mocked<RefreshTokensRepository>;
  let passwordService: jest.Mocked<PasswordService>;
  let mailService: jest.Mocked<MailService>;
  let websocketEvents: jest.Mocked<WebsocketEventsService>;
  let auditService: jest.Mocked<AuditService>;
  let prismaService: jest.Mocked<PrismaService>;

  const userId = '11111111-1111-1111-1111-111111111111';
  const idempotencyKey = 'test-idempotency-key';

  function makeUser(status: UserStatus = UserStatus.ACTIVE) {
    return {
      id: userId,
      email: 'user@example.com',
      username: 'user',
      passwordHash: 'hash',
      displayName: null,
      avatarUrl: null,
      status,
      deletionScheduledFor:
        status === UserStatus.PENDING_DELETION
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          : null,
    } as Awaited<ReturnType<UsersRepository['findById']>>;
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountDeletionService,
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            findByEmail: jest.fn(),
            findActiveWorkspaceOwnerships: jest.fn().mockResolvedValue([]),
            findActiveGroupsWhereUserIsOnlyOwner: jest
              .fn()
              .mockResolvedValue([]),
            scheduleDeletionWithOwnershipCheck: jest.fn(),
            findByDeletionCancellationTokenHash: jest.fn(),
            clearDeletionRequest: jest.fn(),
            updateDeletionCancellationToken: jest.fn(),
            deletePushSubscriptionsForUser: jest
              .fn()
              .mockResolvedValue({ count: 0 }),
          },
        },
        {
          provide: RefreshTokensRepository,
          useValue: {
            revokeAllForUser: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            verifyPassword: jest.fn(),
            hashPassword: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendAccountDeletionCancellationEmail: jest
              .fn()
              .mockResolvedValue(undefined),
            sendAccountDeletionCancelledConfirmationEmail: jest
              .fn()
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WebsocketEventsService,
          useValue: {
            disconnectUser: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn().mockImplementation((token: unknown) => {
              if (token === WebsocketEventsService) {
                return moduleRef.get<WebsocketEventsService>(
                  WebsocketEventsService,
                );
              }
              return undefined;
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(
              (callback: (tx: unknown) => Promise<unknown>) => callback(mockTx),
            ),
          },
        },
        {
          provide: AccountDeletionIdempotencyService,
          useValue: {
            run: jest.fn(
              (
                _key: string,
                _userId: string,
                _bodyHash: string,
                operation: () => Promise<RequestAccountDeletionResult>,
              ) => operation(),
            ),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AccountDeletionService);
    usersRepository = moduleRef.get(UsersRepository);
    refreshTokensRepository = moduleRef.get(RefreshTokensRepository);
    passwordService = moduleRef.get(PasswordService);
    mailService = moduleRef.get(MailService);
    websocketEvents = moduleRef.get(WebsocketEventsService);
    auditService = moduleRef.get(AuditService);
    prismaService = moduleRef.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestAccountDeletion', () => {
    it('rejects when idempotency key is missing', async () => {
      await expect(
        service.requestAccountDeletion(userId, 'password', 'DELETE MY ACCOUNT'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid confirmation phrase', async () => {
      await expect(
        service.requestAccountDeletion(
          userId,
          'password',
          'wrong phrase',
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when user not found', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.requestAccountDeletion(
          userId,
          'password',
          'DELETE MY ACCOUNT',
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent for PENDING_DELETION user and does not send another email', async () => {
      usersRepository.findById.mockResolvedValue(
        makeUser(UserStatus.PENDING_DELETION),
      );

      const result = await service.requestAccountDeletion(
        userId,
        'password',
        'DELETE MY ACCOUNT',
        idempotencyKey,
      );

      expect(result.scheduledFor).toEqual(
        (await usersRepository.findById(userId))?.deletionScheduledFor,
      );
      expect(
        usersRepository.scheduleDeletionWithOwnershipCheck,
      ).not.toHaveBeenCalled();
      expect(refreshTokensRepository.revokeAllForUser).not.toHaveBeenCalled();
      expect(
        mailService.sendAccountDeletionCancellationEmail,
      ).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('rejects when user is ANONYMIZED', async () => {
      usersRepository.findById.mockResolvedValue(
        makeUser(UserStatus.ANONYMIZED),
      );

      await expect(
        service.requestAccountDeletion(
          userId,
          'password',
          'DELETE MY ACCOUNT',
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects wrong password', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.requestAccountDeletion(
          userId,
          'wrongpassword',
          'DELETE MY ACCOUNT',
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when user owns an active workspace', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.scheduleDeletionWithOwnershipCheck.mockResolvedValue({
        type: 'blockers',
        workspaces: [{ id: 'ws1', name: 'Workspace', slug: 'workspace' }],
        groups: [],
      });

      await expect(
        service.requestAccountDeletion(
          userId,
          'password',
          'DELETE MY ACCOUNT',
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(
        usersRepository.scheduleDeletionWithOwnershipCheck,
      ).toHaveBeenCalledWith(userId, expect.any(String), expect.any(Date));
    });

    it('rejects when user is the sole owner of an active group', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.scheduleDeletionWithOwnershipCheck.mockResolvedValue({
        type: 'blockers',
        workspaces: [],
        groups: [{ id: 'g1', name: 'Group', memberId: 'm1' }],
      });

      await expect(
        service.requestAccountDeletion(
          userId,
          'password',
          'DELETE MY ACCOUNT',
          idempotencyKey,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('schedules deletion and revokes sessions on success', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.scheduleDeletionWithOwnershipCheck.mockResolvedValue({
        type: 'scheduled',
      });

      const result = await service.requestAccountDeletion(
        userId,
        'password',
        'DELETE MY ACCOUNT',
        idempotencyKey,
      );

      expect(result.scheduledFor).toBeInstanceOf(Date);
      expect(
        usersRepository.scheduleDeletionWithOwnershipCheck,
      ).toHaveBeenCalledWith(userId, expect.any(String), expect.any(Date));
      expect(refreshTokensRepository.revokeAllForUser).toHaveBeenCalledWith(
        userId,
      );
      expect(
        usersRepository.deletePushSubscriptionsForUser,
      ).toHaveBeenCalledWith(userId);
      expect(websocketEvents.disconnectUser).toHaveBeenCalledWith(userId);
      expect(auditService.record).toHaveBeenCalled();
      expect(
        mailService.sendAccountDeletionCancellationEmail,
      ).toHaveBeenCalled();
    });

    it('rolls back to ACTIVE when audit recording fails', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.scheduleDeletionWithOwnershipCheck.mockResolvedValue({
        type: 'scheduled',
      });
      auditService.record.mockRejectedValue(new Error('Audit failure'));

      await expect(
        service.requestAccountDeletion(
          userId,
          'password',
          'DELETE MY ACCOUNT',
          idempotencyKey,
        ),
      ).rejects.toThrow('Audit failure');

      expect(usersRepository.clearDeletionRequest).toHaveBeenCalledWith(userId);
      expect(refreshTokensRepository.revokeAllForUser).not.toHaveBeenCalled();
      expect(
        usersRepository.deletePushSubscriptionsForUser,
      ).not.toHaveBeenCalled();
      expect(websocketEvents.disconnectUser).not.toHaveBeenCalled();
    });

    it('rolls back to ACTIVE when cancellation email fails', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.scheduleDeletionWithOwnershipCheck.mockResolvedValue({
        type: 'scheduled',
      });
      mailService.sendAccountDeletionCancellationEmail.mockRejectedValue(
        new Error('Mail failure'),
      );

      await expect(
        service.requestAccountDeletion(
          userId,
          'password',
          'DELETE MY ACCOUNT',
          idempotencyKey,
        ),
      ).rejects.toThrow('Mail failure');

      expect(usersRepository.clearDeletionRequest).toHaveBeenCalledWith(userId);
      expect(refreshTokensRepository.revokeAllForUser).not.toHaveBeenCalled();
      expect(
        usersRepository.deletePushSubscriptionsForUser,
      ).not.toHaveBeenCalled();
      expect(websocketEvents.disconnectUser).not.toHaveBeenCalled();
    });

    it('does not roll back when a post-commit side effect fails', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.scheduleDeletionWithOwnershipCheck.mockResolvedValue({
        type: 'scheduled',
      });
      refreshTokensRepository.revokeAllForUser.mockRejectedValue(
        new Error('revoke failed'),
      );

      const result = await service.requestAccountDeletion(
        userId,
        'password',
        'DELETE MY ACCOUNT',
        idempotencyKey,
      );

      expect(result.scheduledFor).toBeInstanceOf(Date);
      expect(auditService.record).toHaveBeenCalled();
      expect(
        mailService.sendAccountDeletionCancellationEmail,
      ).toHaveBeenCalled();
      expect(refreshTokensRepository.revokeAllForUser).toHaveBeenCalledWith(
        userId,
      );
      expect(usersRepository.clearDeletionRequest).not.toHaveBeenCalled();
    });

    it('allows a second request after rollback due to mail failure', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.scheduleDeletionWithOwnershipCheck.mockResolvedValue({
        type: 'scheduled',
      });
      mailService.sendAccountDeletionCancellationEmail
        .mockRejectedValueOnce(new Error('Mail failure'))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.requestAccountDeletion(
          userId,
          'password',
          'DELETE MY ACCOUNT',
          idempotencyKey,
        ),
      ).rejects.toThrow('Mail failure');
      expect(usersRepository.clearDeletionRequest).toHaveBeenCalledTimes(1);

      // A new idempotency key represents a fresh logical request.
      const result = await service.requestAccountDeletion(
        userId,
        'password',
        'DELETE MY ACCOUNT',
        'new-idempotency-key',
      );
      expect(result.scheduledFor).toBeInstanceOf(Date);
      expect(
        mailService.sendAccountDeletionCancellationEmail,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelAccountDeletion', () => {
    it('rejects invalid token', async () => {
      usersRepository.findByDeletionCancellationTokenHash.mockResolvedValue(
        null,
      );

      await expect(
        service.cancelAccountDeletion('invalid-token'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects token for non-pending user', async () => {
      usersRepository.findByDeletionCancellationTokenHash.mockResolvedValue(
        makeUser(UserStatus.ACTIVE),
      );

      await expect(
        service.cancelAccountDeletion('valid-token'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects expired token', async () => {
      const user = {
        ...makeUser(UserStatus.PENDING_DELETION),
        deletionCancellationExpiresAt: new Date(Date.now() - 1000),
      } as Awaited<
        ReturnType<UsersRepository['findByDeletionCancellationTokenHash']>
      >;
      usersRepository.findByDeletionCancellationTokenHash.mockResolvedValue(
        user,
      );

      await expect(
        service.cancelAccountDeletion('valid-token'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cancels deletion atomically and sends confirmation email', async () => {
      const user = {
        ...makeUser(UserStatus.PENDING_DELETION),
        deletionCancellationExpiresAt: new Date(Date.now() + 10000),
      } as Awaited<
        ReturnType<UsersRepository['findByDeletionCancellationTokenHash']>
      >;
      usersRepository.findByDeletionCancellationTokenHash.mockResolvedValue(
        user,
      );

      const result = await service.cancelAccountDeletion('valid-token');

      expect(result.success).toBe(true);
      expect(prismaService.$transaction).toHaveBeenCalled();
      expect(mockTx.user.updateMany).toHaveBeenCalledWith({
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
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: userId,
          action: 'account_deletion.cancelled',
          entityType: 'user',
          entityId: userId,
          severity: 'critical',
        },
      });
      expect(usersRepository.clearDeletionRequest).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
      expect(
        mailService.sendAccountDeletionCancelledConfirmationEmail,
      ).toHaveBeenCalled();
    });

    it('does not cancel when atomic transaction fails', async () => {
      const user = {
        ...makeUser(UserStatus.PENDING_DELETION),
        deletionCancellationExpiresAt: new Date(Date.now() + 10000),
      } as Awaited<
        ReturnType<UsersRepository['findByDeletionCancellationTokenHash']>
      >;
      usersRepository.findByDeletionCancellationTokenHash.mockResolvedValue(
        user,
      );
      prismaService.$transaction.mockRejectedValueOnce(
        new Error('Transaction failure'),
      );

      await expect(
        service.cancelAccountDeletion('valid-token'),
      ).rejects.toThrow('Transaction failure');

      expect(
        mailService.sendAccountDeletionCancelledConfirmationEmail,
      ).not.toHaveBeenCalled();
      expect(usersRepository.clearDeletionRequest).not.toHaveBeenCalled();
    });

    it('returns success even when confirmation email fails after cancellation', async () => {
      const user = {
        ...makeUser(UserStatus.PENDING_DELETION),
        deletionCancellationExpiresAt: new Date(Date.now() + 10000),
      } as Awaited<
        ReturnType<UsersRepository['findByDeletionCancellationTokenHash']>
      >;
      usersRepository.findByDeletionCancellationTokenHash.mockResolvedValue(
        user,
      );
      mailService.sendAccountDeletionCancelledConfirmationEmail.mockRejectedValue(
        new Error('Mail failure'),
      );

      const result = await service.cancelAccountDeletion('valid-token');

      expect(result.success).toBe(true);
      expect(prismaService.$transaction).toHaveBeenCalled();
      expect(
        mailService.sendAccountDeletionCancelledConfirmationEmail,
      ).toHaveBeenCalled();
      expect(usersRepository.clearDeletionRequest).not.toHaveBeenCalled();
    });
  });

  describe('resendAccountDeletionCancellation', () => {
    it('returns generic success for unknown email', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      const result = await service.resendAccountDeletionCancellation(
        'missing@example.com',
        'password',
      );

      expect(result.success).toBe(true);
      expect(
        usersRepository.updateDeletionCancellationToken,
      ).not.toHaveBeenCalled();
      expect(
        mailService.sendAccountDeletionCancellationEmail,
      ).not.toHaveBeenCalled();
    });

    it('returns generic success for non-pending user', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());

      const result = await service.resendAccountDeletionCancellation(
        'user@example.com',
        'password',
      );

      expect(result.success).toBe(true);
      expect(
        usersRepository.updateDeletionCancellationToken,
      ).not.toHaveBeenCalled();
      expect(
        mailService.sendAccountDeletionCancellationEmail,
      ).not.toHaveBeenCalled();
    });

    it('returns generic success for wrong password', async () => {
      usersRepository.findByEmail.mockResolvedValue(
        makeUser(UserStatus.PENDING_DELETION),
      );
      passwordService.verifyPassword.mockResolvedValue(false);

      const result = await service.resendAccountDeletionCancellation(
        'user@example.com',
        'wrongpassword',
      );

      expect(result.success).toBe(true);
      expect(
        usersRepository.updateDeletionCancellationToken,
      ).not.toHaveBeenCalled();
      expect(
        mailService.sendAccountDeletionCancellationEmail,
      ).not.toHaveBeenCalled();
    });

    it('generates a new token and sends email for pending user', async () => {
      const scheduledFor = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      usersRepository.findByEmail.mockResolvedValue({
        ...makeUser(UserStatus.PENDING_DELETION),
        deletionScheduledFor: scheduledFor,
      } as never);
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.updateDeletionCancellationToken.mockResolvedValue(
        makeUser(UserStatus.PENDING_DELETION) as never,
      );

      const result = await service.resendAccountDeletionCancellation(
        'user@example.com',
        'password',
      );

      expect(result.success).toBe(true);
      expect(
        usersRepository.updateDeletionCancellationToken,
      ).toHaveBeenCalledWith(userId, expect.any(String), scheduledFor);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'account_deletion.cancellation_resent',
        }),
      );
      expect(
        mailService.sendAccountDeletionCancellationEmail,
      ).toHaveBeenCalled();
    });

    it('restores the previous token hash when mail fails', async () => {
      const scheduledFor = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      usersRepository.findByEmail.mockResolvedValue({
        ...makeUser(UserStatus.PENDING_DELETION),
        deletionScheduledFor: scheduledFor,
        deletionCancellationTokenHash: 'old-hash',
      } as never);
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.updateDeletionCancellationToken.mockResolvedValue(
        makeUser(UserStatus.PENDING_DELETION) as never,
      );
      mailService.sendAccountDeletionCancellationEmail.mockRejectedValue(
        new Error('Mail failure'),
      );

      await expect(
        service.resendAccountDeletionCancellation(
          'user@example.com',
          'password',
        ),
      ).rejects.toThrow('Mail failure');

      expect(
        usersRepository.updateDeletionCancellationToken,
      ).toHaveBeenCalledTimes(2);
      expect(
        usersRepository.updateDeletionCancellationToken,
      ).toHaveBeenLastCalledWith(userId, 'old-hash', scheduledFor);
    });
  });
});
