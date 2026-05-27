import { Test } from '@nestjs/testing';
import { AuthService, AuthUserResponse } from './auth.service';

import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { ConfigService } from '@nestjs/config';

describe('AuthService', () => {
  let service: AuthService;
  let usersRepository: jest.Mocked<UsersRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
            findByEmail: jest.fn(),
            findByUsername: jest.fn(),
            createUser: jest.fn(),
            updateDisplayName: jest.fn(),
            updateAvatar: jest.fn(),
            updateLanguages: jest.fn(),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            hashPassword: jest.fn(),
            verifyPassword: jest.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            signAccessToken: jest.fn(),
            signRefreshToken: jest.fn(),
            verifyRefreshToken: jest.fn(),
          },
        },
        {
          provide: RefreshTokensRepository,
          useValue: {
            createToken: jest.fn(),
            consumeActiveToken: jest.fn(),
            revokeToken: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('7d'),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    usersRepository = moduleRef.get(UsersRepository);
  });

  it('updateMe calls users.updateDisplayName and returns AuthUserResponse with displayName', async () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: 'John Doe',
      passwordHash: 'hash',
      avatarUrl: null,
      avatarUpdatedAt: null,
      languages: [] as string[],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    usersRepository.updateDisplayName.mockResolvedValue(user);

    const result = await service.updateMe('user-id', 'John Doe');

    expect(usersRepository.updateDisplayName).toHaveBeenCalledWith(
      'user-id',
      'John Doe',
    );
    expect(result.displayName).toBe('John Doe');
  });

  it('toAuthUserResponse includes displayName and avatar fields', () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: 'Jane Doe',
      avatarUrl: '/avatars/avatar-1.svg',
      avatarUpdatedAt: new Date('2024-01-01'),
      passwordHash: 'hash',
      languages: [] as string[],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const servicePrivate = service as unknown as {
      toAuthUserResponse: (user: unknown) => AuthUserResponse;
    };
    const result = servicePrivate.toAuthUserResponse(user);

    expect(result.displayName).toBe('Jane Doe');
    expect(result.avatarUrl).toBe('/avatars/avatar-1.svg');
    expect(result.avatarUpdatedAt).toEqual(new Date('2024-01-01'));
  });

  it('toAuthUserResponse handles null avatar fields', () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      passwordHash: 'hash',
      languages: [] as string[],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const servicePrivate = service as unknown as {
      toAuthUserResponse: (user: unknown) => AuthUserResponse;
    };
    const result = servicePrivate.toAuthUserResponse(user);

    expect(result.avatarUrl).toBeNull();
    expect(result.avatarUpdatedAt).toBeNull();
  });

  it('updateAvatar calls users.updateAvatar and returns AuthUserResponse with avatarUrl', async () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: null,
      avatarUrl: '/avatars/avatar-3.svg',
      avatarUpdatedAt: new Date(),
      passwordHash: 'hash',
      languages: [] as string[],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    usersRepository.updateAvatar.mockResolvedValue(user);

    const result = await service.updateAvatar(
      'user-id',
      '/avatars/avatar-3.svg',
    );

    expect(usersRepository.updateAvatar).toHaveBeenCalledWith(
      'user-id',
      '/avatars/avatar-3.svg',
    );
    expect(result.avatarUrl).toBe('/avatars/avatar-3.svg');
    expect(result.avatarUpdatedAt).toBeInstanceOf(Date);
  });

  it('updateAvatar response does not include passwordHash', async () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: null,
      avatarUrl: '/avatars/avatar-1.svg',
      avatarUpdatedAt: new Date(),
      passwordHash: 'super-secret-hash',
      languages: [] as string[],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    usersRepository.updateAvatar.mockResolvedValue(user);

    const result = await service.updateAvatar(
      'user-id',
      '/avatars/avatar-1.svg',
    );

    expect(result).not.toHaveProperty('passwordHash');
  });

  it('toAuthUserResponse includes languages', () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      passwordHash: 'hash',
      languages: ['English', 'Ukrainian'],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const servicePrivate = service as unknown as {
      toAuthUserResponse: (user: unknown) => AuthUserResponse;
    };
    const result = servicePrivate.toAuthUserResponse(user);

    expect(result.languages).toEqual(['English', 'Ukrainian']);
  });

  it('updateLanguages calls users.updateLanguages and returns AuthUserResponse with languages', async () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      passwordHash: 'hash',
      languages: ['English'],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    usersRepository.updateLanguages.mockResolvedValue(user);

    const result = await service.updateLanguages('user-id', ['English']);

    expect(usersRepository.updateLanguages).toHaveBeenCalledWith('user-id', [
      'English',
    ]);
    expect(result.languages).toEqual(['English']);
  });
});
