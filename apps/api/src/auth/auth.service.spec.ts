import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
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
      createdAt: new Date(),
    };

    usersRepository.updateDisplayName.mockResolvedValue(user as any);

    const result = await service.updateMe('user-id', 'John Doe');

    expect(usersRepository.updateDisplayName).toHaveBeenCalledWith('user-id', 'John Doe');
    expect(result.displayName).toBe('John Doe');
  });

  it('toAuthUserResponse includes displayName', () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: 'Jane Doe',
      passwordHash: 'hash',
      createdAt: new Date(),
    };

    const result = (service as any).toAuthUserResponse(user);

    expect(result.displayName).toBe('Jane Doe');
  });
});
