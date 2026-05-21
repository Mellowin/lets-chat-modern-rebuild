import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessGuard } from './guards/jwt-access.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const user = {
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    avatarUrl: null,
    avatarUpdatedAt: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
            updateMe: jest.fn(),
            updateAvatar: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(AuthController);
    authService = moduleRef.get(AuthService);
  });

  it('PATCH /auth/me trims displayName and calls updateMe', async () => {
    authService.updateMe.mockResolvedValue({
      ...user,
      displayName: 'John Doe',
    } as any);

    await controller.updateMe(user as any, { displayName: '  John Doe  ' });

    expect(authService.updateMe).toHaveBeenCalledWith('user-id', 'John Doe');
  });

  it('PATCH /auth/me converts empty string to null', async () => {
    authService.updateMe.mockResolvedValue({
      ...user,
      displayName: null,
    } as any);

    await controller.updateMe(user as any, { displayName: '   ' });

    expect(authService.updateMe).toHaveBeenCalledWith('user-id', null);
  });

  describe('PATCH /auth/me/avatar', () => {
    it('allows update when no previous avatarUpdatedAt', async () => {
      authService.updateAvatar.mockResolvedValue({
        ...user,
        avatarUrl: '/avatars/avatar-1.svg',
        avatarUpdatedAt: new Date(),
      } as any);

      const result = await controller.updateAvatar(user as any, {
        avatarUrl: '/avatars/avatar-1.svg',
      } as any);

      expect(authService.updateAvatar).toHaveBeenCalledWith(
        'user-id',
        '/avatars/avatar-1.svg',
      );
      expect(result.avatarUrl).toBe('/avatars/avatar-1.svg');
    });

    it('allows update when avatarUpdatedAt is older than 7 days', async () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      authService.updateAvatar.mockResolvedValue({
        ...user,
        avatarUrl: '/avatars/avatar-2.svg',
        avatarUpdatedAt: new Date(),
      } as any);

      const result = await controller.updateAvatar(
        { ...user, avatarUpdatedAt: oldDate } as any,
        { avatarUrl: '/avatars/avatar-2.svg' } as any,
      );

      expect(authService.updateAvatar).toHaveBeenCalledWith(
        'user-id',
        '/avatars/avatar-2.svg',
      );
      expect(result.avatarUrl).toBe('/avatars/avatar-2.svg');
    });

    it('blocks update when avatarUpdatedAt is less than 7 days ago', async () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      await expect(
        controller.updateAvatar(
          { ...user, avatarUpdatedAt: recentDate } as any,
          { avatarUrl: '/avatars/avatar-3.svg' } as any,
        ),
      ).rejects.toThrow('Avatar can be changed once every 7 days');

      expect(authService.updateAvatar).not.toHaveBeenCalled();
    });
  });
});
