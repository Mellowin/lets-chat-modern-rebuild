import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAccessGuard } from './jwt-access.guard';
import { TokenService } from '../token.service';
import { UsersRepository } from '../../users/users.repository';

describe('JwtAccessGuard', () => {
  let guard: JwtAccessGuard;
  let tokenService: jest.Mocked<TokenService>;
  let usersRepository: jest.Mocked<UsersRepository>;

  beforeEach(() => {
    tokenService = {
      verifyAccessToken: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;

    usersRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    guard = new JwtAccessGuard(tokenService, usersRepository);
  });

  const createContext = (authHeader?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: authHeader ? { authorization: authHeader } : {},
        }),
      }),
    }) as ExecutionContext;

  it('should allow access with a valid token and attach user', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      sub: 'user-id',
      email: 'u@test.com',
      jti: 'jti-1',
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    usersRepository.findById.mockResolvedValue({
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      interfaceLanguage: 'en',
      createdAt: new Date(),
    } as any);

    const result = await guard.canActivate(createContext('Bearer valid-token'));
    expect(result).toBe(true);
    expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
  });

  it('should reject an expired Bearer token', async () => {
    tokenService.verifyAccessToken.mockRejectedValue(new Error('jwt expired'));

    await expect(
      guard.canActivate(createContext('Bearer expired-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject a malformed Bearer token', async () => {
    tokenService.verifyAccessToken.mockRejectedValue(
      new Error('jwt malformed'),
    );

    await expect(
      guard.canActivate(createContext('Bearer bad-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject a missing Authorization header', async () => {
    await expect(guard.canActivate(createContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should reject when user is not found', async () => {
    tokenService.verifyAccessToken.mockResolvedValue({
      sub: 'missing-user',
      email: 'u@test.com',
      jti: 'jti-2',
    });
    usersRepository.findById.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext('Bearer valid-token')),
    ).rejects.toThrow(UnauthorizedException);
  });
});
