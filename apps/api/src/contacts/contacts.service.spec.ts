import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { ContactsRepository } from './contacts.repository';
import { UsersRepository } from '../users/users.repository';
import { DirectConversationsService } from '../direct-conversations/direct-conversations.service';
import { BlocksService } from '../safety/blocks.service';

const userId = '11111111-1111-1111-1111-111111111111';
const otherUserId = '22222222-2222-2222-2222-222222222222';

function makeUser(
  overrides: Partial<Awaited<ReturnType<UsersRepository['findById']>>> = {},
) {
  return {
    id: otherUserId,
    username: 'bob',
    email: 'bob@example.com',
    passwordHash: 'hash',
    displayName: 'Bob',
    avatarUrl: null,
    avatarUpdatedAt: null,
    interfaceLanguage: 'en',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    emailVerifiedAt: null,
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
    ...overrides,
  };
}

function makeContact(
  overrides: Partial<
    Awaited<ReturnType<ContactsRepository['findActiveByOwnerAndContact']>>
  > = {},
): NonNullable<
  Awaited<ReturnType<ContactsRepository['findActiveByOwnerAndContact']>>
> {
  const base = {
    id: 'contact-id',
    ownerUserId: userId,
    contactUserId: otherUserId,
    nickname: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    contactUser: {
      id: otherUserId,
      username: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
    },
  };
  return { ...base, ...overrides };
}

describe('ContactsService', () => {
  let service: ContactsService;
  let contactsRepository: jest.Mocked<ContactsRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let directConversations: jest.Mocked<DirectConversationsService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactsService,
        {
          provide: ContactsRepository,
          useValue: {
            findActiveByOwnerAndContact: jest.fn(),
            listActiveByOwner: jest.fn(),
            upsertContact: jest.fn(),
            softDeleteContact: jest.fn(),
          },
        },
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            findByUsername: jest.fn(),
            findByEmail: jest.fn(),
          },
        },
        {
          provide: DirectConversationsService,
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: BlocksService,
          useValue: {
            requireNoBlockInEitherDirection: jest
              .fn()
              .mockResolvedValue(undefined),
            listBlockedUsers: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(ContactsService);
    contactsRepository = moduleRef.get(ContactsRepository);
    usersRepository = moduleRef.get(UsersRepository);
    directConversations = moduleRef.get(DirectConversationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('adds a contact by userId', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      contactsRepository.upsertContact.mockResolvedValue(makeContact());

      const result = await service.create({ userId: otherUserId }, userId);

      expect(result?.contactUserId).toBe(otherUserId);
      expect(contactsRepository.upsertContact).toHaveBeenCalledWith({
        ownerUserId: userId,
        contactUserId: otherUserId,
        nickname: null,
      });
    });

    it('adds a contact by email', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());
      contactsRepository.upsertContact.mockResolvedValue(makeContact());

      const result = await service.create({ email: 'bob@example.com' }, userId);

      expect(result?.contactUserId).toBe(otherUserId);
    });

    it('rejects adding self', async () => {
      usersRepository.findById.mockResolvedValue(makeUser({ id: userId }));

      await expect(service.create({ userId }, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(contactsRepository.upsertContact).not.toHaveBeenCalled();
    });

    it('rejects when no identifier is provided', async () => {
      await expect(service.create({}, userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when user is not found', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.create({ userId: otherUserId }, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns contacts for the owner only', async () => {
      contactsRepository.listActiveByOwner.mockResolvedValue([makeContact()]);

      const result = await service.list(userId);

      expect(result).toHaveLength(1);
      expect(result[0]?.contactUserId).toBe(otherUserId);
      expect(contactsRepository.listActiveByOwner).toHaveBeenCalledWith(userId);
    });
  });

  describe('remove', () => {
    it('removes an active contact', async () => {
      contactsRepository.softDeleteContact.mockResolvedValue(1);

      const result = await service.remove(otherUserId, userId);

      expect(result.success).toBe(true);
      expect(contactsRepository.softDeleteContact).toHaveBeenCalledWith(
        userId,
        otherUserId,
      );
    });

    it('throws NotFoundException when contact does not exist', async () => {
      contactsRepository.softDeleteContact.mockResolvedValue(0);

      await expect(service.remove(otherUserId, userId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('startDirectConversation', () => {
    it('starts a DM with a contact', async () => {
      contactsRepository.findActiveByOwnerAndContact.mockResolvedValue(
        makeContact(),
      );
      directConversations.create.mockResolvedValue({
        id: 'dm-id',
        otherParticipant: {
          id: otherUserId,
          username: 'bob',
          displayName: 'Bob',
          avatarUrl: null,
        },
      } as Awaited<ReturnType<DirectConversationsService['create']>>);

      const result = await service.startDirectConversation(otherUserId, userId);

      expect(result.id).toBe('dm-id');
      expect(directConversations.create).toHaveBeenCalledWith(
        { userId: otherUserId },
        userId,
      );
    });

    it('throws NotFoundException when contact does not exist', async () => {
      contactsRepository.findActiveByOwnerAndContact.mockResolvedValue(null);

      await expect(
        service.startDirectConversation(otherUserId, userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
