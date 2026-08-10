import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@lets-chat/database';
import { AccountDeletionService } from './account-deletion.service';
import { UsersRepository } from '../users/users.repository';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { PasswordService } from './password.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { WebsocketEventsService } from '../websocket/websocket-events.service';

describe('AccountDeletionService', () => {
  let service: AccountDeletionService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let refreshTokensRepository: jest.Mocked<RefreshTokensRepository>;
  let passwordService: jest.Mocked<PasswordService>;
  let mailService: jest.Mocked<MailService>;
  let websocketEvents: jest.Mocked<WebsocketEventsService>;
  let auditService: jest.Mocked<AuditService>;

  const userId = '11111111-1111-1111-1111-111111111111';

  function makeUser(status: UserStatus = UserStatus.ACTIVE) {
    return {
      id: userId,
      email: 'user@example.com',
      username: 'user',
      passwordHash: 'hash',
      displayName: null,
      avatarUrl: null,
      status,
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
            findActiveWorkspaceOwnerships: jest.fn().mockResolvedValue([]),
            findActiveGroupsWhereUserIsOnlyOwner: jest
              .fn()
              .mockResolvedValue([]),
            requestAccountDeletion: jest.fn(),
            findByDeletionCancellationTokenHash: jest.fn(),
            clearDeletionRequest: jest.fn(),
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
      ],
    }).compile();

    service = moduleRef.get(AccountDeletionService);
    usersRepository = moduleRef.get(UsersRepository);
    refreshTokensRepository = moduleRef.get(RefreshTokensRepository);
    passwordService = moduleRef.get(PasswordService);
    mailService = moduleRef.get(MailService);
    websocketEvents = moduleRef.get(WebsocketEventsService);
    auditService = moduleRef.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestAccountDeletion', () => {
    it('rejects invalid confirmation phrase', async () => {
      await expect(
        service.requestAccountDeletion(userId, 'password', 'wrong phrase'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when user not found', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.requestAccountDeletion(userId, 'password', 'DELETE MY ACCOUNT'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when user is not ACTIVE', async () => {
      usersRepository.findById.mockResolvedValue(
        makeUser(UserStatus.PENDING_DELETION),
      );

      await expect(
        service.requestAccountDeletion(userId, 'password', 'DELETE MY ACCOUNT'),
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
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when user owns an active workspace', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.findActiveWorkspaceOwnerships.mockResolvedValue([
        { id: 'ws1', name: 'Workspace', slug: 'workspace' },
      ]);

      await expect(
        service.requestAccountDeletion(userId, 'password', 'DELETE MY ACCOUNT'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when user is the sole owner of an active group', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.findActiveGroupsWhereUserIsOnlyOwner.mockResolvedValue([
        { id: 'g1', name: 'Group', memberId: 'm1' },
      ]);

      await expect(
        service.requestAccountDeletion(userId, 'password', 'DELETE MY ACCOUNT'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('schedules deletion and revokes sessions on success', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);
      usersRepository.requestAccountDeletion.mockResolvedValue(
        makeUser(UserStatus.PENDING_DELETION) as NonNullable<
          Awaited<ReturnType<UsersRepository['requestAccountDeletion']>>
        >,
      );

      const result = await service.requestAccountDeletion(
        userId,
        'password',
        'DELETE MY ACCOUNT',
      );

      expect(result.scheduledFor).toBeInstanceOf(Date);
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

    it('cancels deletion and sends confirmation email', async () => {
      const user = {
        ...makeUser(UserStatus.PENDING_DELETION),
        deletionCancellationExpiresAt: new Date(Date.now() + 10000),
      } as Awaited<
        ReturnType<UsersRepository['findByDeletionCancellationTokenHash']>
      >;
      usersRepository.findByDeletionCancellationTokenHash.mockResolvedValue(
        user,
      );
      usersRepository.clearDeletionRequest.mockResolvedValue(
        makeUser() as NonNullable<
          Awaited<ReturnType<UsersRepository['clearDeletionRequest']>>
        >,
      );

      const result = await service.cancelAccountDeletion('valid-token');

      expect(result.success).toBe(true);
      expect(usersRepository.clearDeletionRequest).toHaveBeenCalledWith(userId);
      expect(auditService.record).toHaveBeenCalled();
      expect(
        mailService.sendAccountDeletionCancelledConfirmationEmail,
      ).toHaveBeenCalled();
    });
  });
});
