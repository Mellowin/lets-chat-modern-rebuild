import { Test, type TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { AuthUserResponse } from './auth.service';
import { AvatarUploadService } from './avatar-upload.service';
import { JwtAccessGuard } from './guards/jwt-access.guard';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let moduleRef: TestingModule;

  const user: AuthUserResponse = {
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    avatarUrl: null,
    avatarUpdatedAt: null,
    interfaceLanguage: 'en',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            refresh: jest.fn(),
            logout: jest.fn(),
            verifyEmail: jest.fn(),
            resendVerification: jest.fn(),
            forgotPassword: jest.fn(),
            resetPassword: jest.fn(),
            requestEmailChange: jest.fn(),
            confirmEmailChange: jest.fn(),
            updateMe: jest.fn(),
            updateAvatar: jest.fn(),
            updateInterfaceLanguage: jest.fn(),
          },
        },
        {
          provide: AvatarUploadService,
          useValue: {
            save: jest.fn(),
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

  describe('PATCH /auth/me/avatar/upload', () => {
    let avatarUpload: jest.Mocked<AvatarUploadService>;

    beforeEach(() => {
      avatarUpload = moduleRef.get(AvatarUploadService);
    });

    it('uploads avatar and updates avatarUrl', async () => {
      avatarUpload.save.mockResolvedValue('/uploads/avatars/user-id/test.png');
      authService.updateAvatar.mockResolvedValue({
        ...user,
        avatarUrl: '/uploads/avatars/user-id/test.png',
        avatarUpdatedAt: new Date(),
      });

      const file = {
        buffer: Buffer.from('png'),
        mimetype: 'image/png',
        originalname: 'avatar.png',
        size: 1234,
      } as Express.Multer.File;

      const result = await controller.updateAvatarUpload(user, file);

      expect(avatarUpload.save).toHaveBeenCalledWith(file, 'user-id');
      expect(authService.updateAvatar).toHaveBeenCalledWith(
        'user-id',
        '/uploads/avatars/user-id/test.png',
      );
      expect(result.avatarUrl).toBe('/uploads/avatars/user-id/test.png');
    });

    it('respects 7-day cooldown for upload', async () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const file = {
        buffer: Buffer.from('png'),
        mimetype: 'image/png',
        originalname: 'avatar.png',
        size: 1234,
      } as Express.Multer.File;

      await expect(
        controller.updateAvatarUpload(
          { ...user, avatarUpdatedAt: recentDate },
          file,
        ),
      ).rejects.toThrow('Avatar can be changed once every 7 days');

      expect(avatarUpload.save).not.toHaveBeenCalled();
      expect(authService.updateAvatar).not.toHaveBeenCalled();
    });
  });

  it('PATCH /auth/me trims displayName and calls updateMe', async () => {
    authService.updateMe.mockResolvedValue({
      ...user,
      displayName: 'John Doe',
    });

    await controller.updateMe(user, { displayName: '  John Doe  ' });

    expect(authService.updateMe).toHaveBeenCalledWith('user-id', 'John Doe');
  });

  it('PATCH /auth/me converts empty string to null', async () => {
    authService.updateMe.mockResolvedValue({
      ...user,
      displayName: null,
    });

    await controller.updateMe(user, { displayName: '   ' });

    expect(authService.updateMe).toHaveBeenCalledWith('user-id', null);
  });

  describe('PATCH /auth/me/interface-language', () => {
    it('updates interface language to uk', async () => {
      authService.updateInterfaceLanguage.mockResolvedValue({
        ...user,
        interfaceLanguage: 'uk',
      });

      const result = await controller.updateInterfaceLanguage(user, {
        interfaceLanguage: 'uk',
      });

      expect(authService.updateInterfaceLanguage).toHaveBeenCalledWith(
        'user-id',
        'uk',
      );
      expect(result.interfaceLanguage).toBe('uk');
    });

    it('updates interface language to ru', async () => {
      authService.updateInterfaceLanguage.mockResolvedValue({
        ...user,
        interfaceLanguage: 'ru',
      });

      const result = await controller.updateInterfaceLanguage(user, {
        interfaceLanguage: 'ru',
      });

      expect(authService.updateInterfaceLanguage).toHaveBeenCalledWith(
        'user-id',
        'ru',
      );
      expect(result.interfaceLanguage).toBe('ru');
    });
  });

  describe('PATCH /auth/me/avatar', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('allows update when no previous avatarUpdatedAt', async () => {
      authService.updateAvatar.mockResolvedValue({
        ...user,
        avatarUrl: '/avatars/avatar-1.svg',
        avatarUpdatedAt: new Date(),
      });

      const result = await controller.updateAvatar(user, {
        avatarUrl: '/avatars/avatar-1.svg',
      });

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
      });

      const result = await controller.updateAvatar(
        { ...user, avatarUpdatedAt: oldDate },
        { avatarUrl: '/avatars/avatar-2.svg' },
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
          { ...user, avatarUpdatedAt: recentDate },
          { avatarUrl: '/avatars/avatar-3.svg' },
        ),
      ).rejects.toThrow('Avatar can be changed once every 7 days');

      expect(authService.updateAvatar).not.toHaveBeenCalled();
    });

    it('allows update when avatarUpdatedAt is exactly 7 days ago', async () => {
      const fixedNow = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

      const exactlySevenDaysAgo = new Date(fixedNow - 7 * 24 * 60 * 60 * 1000);
      authService.updateAvatar.mockResolvedValue({
        ...user,
        avatarUrl: '/avatars/avatar-4.svg',
        avatarUpdatedAt: new Date(fixedNow),
      });

      const result = await controller.updateAvatar(
        { ...user, avatarUpdatedAt: exactlySevenDaysAgo },
        { avatarUrl: '/avatars/avatar-4.svg' },
      );

      expect(authService.updateAvatar).toHaveBeenCalledWith(
        'user-id',
        '/avatars/avatar-4.svg',
      );
      expect(result.avatarUrl).toBe('/avatars/avatar-4.svg');
    });

    it('blocks update when avatarUpdatedAt is 7 days minus 1 millisecond ago', async () => {
      const fixedNow = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

      const justUnderSevenDays = new Date(
        fixedNow - 7 * 24 * 60 * 60 * 1000 + 1,
      );

      await expect(
        controller.updateAvatar(
          { ...user, avatarUpdatedAt: justUnderSevenDays },
          { avatarUrl: '/avatars/avatar-5.svg' },
        ),
      ).rejects.toThrow('Avatar can be changed once every 7 days');

      expect(authService.updateAvatar).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/verify-email', () => {
    it('returns success when token is valid', async () => {
      authService.verifyEmail.mockResolvedValue({ success: true });

      const result = await controller.verifyEmail({ token: 'valid-token' });

      expect(authService.verifyEmail).toHaveBeenCalledWith('valid-token');
      expect(result).toEqual({ success: true });
    });

    it('propagates NotFoundException for invalid token', async () => {
      authService.verifyEmail.mockRejectedValue(new Error('Invalid token'));

      await expect(
        controller.verifyEmail({ token: 'bad-token' }),
      ).rejects.toThrow('Invalid token');
    });
  });

  describe('POST /auth/resend-verification', () => {
    it('returns generic message for any email', async () => {
      authService.resendVerification.mockResolvedValue({
        message:
          'If the email exists and is not verified, a verification email has been sent.',
      });

      const result = await controller.resendVerification({
        email: 'test@example.com',
      });

      expect(authService.resendVerification).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(result.message).toBe(
        'If the email exists and is not verified, a verification email has been sent.',
      );
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('returns generic message', async () => {
      authService.forgotPassword.mockResolvedValue({
        message: 'If the email exists, a reset link has been sent.',
      });

      const result = await controller.forgotPassword({
        email: 'test@example.com',
      });

      expect(authService.forgotPassword).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(result.message).toBe(
        'If the email exists, a reset link has been sent.',
      );
    });
  });

  describe('POST /auth/reset-password', () => {
    it('returns success for valid token', async () => {
      authService.resetPassword.mockResolvedValue({ success: true });

      const result = await controller.resetPassword({
        token: 'valid-token',
        password: 'newpass123',
      });

      expect(authService.resetPassword).toHaveBeenCalledWith(
        'valid-token',
        'newpass123',
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('POST /auth/change-email/request', () => {
    it('returns success message', async () => {
      authService.requestEmailChange.mockResolvedValue({
        message: 'Check your new email to confirm the change.',
      });

      const result = await controller.requestEmailChange(
        {
          id: 'user-id',
          email: 'u@test.com',
          username: 'user',
        } as AuthUserResponse,
        { newEmail: 'new@example.com' },
      );

      expect(authService.requestEmailChange).toHaveBeenCalledWith(
        'user-id',
        'new@example.com',
      );
      expect(result.message).toBe(
        'Check your new email to confirm the change.',
      );
    });
  });

  describe('POST /auth/change-email/confirm', () => {
    it('returns success for valid token', async () => {
      authService.confirmEmailChange.mockResolvedValue({ success: true });

      const result = await controller.confirmEmailChange({
        token: 'valid-token',
      });

      expect(authService.confirmEmailChange).toHaveBeenCalledWith(
        'valid-token',
      );
      expect(result).toEqual({ success: true });
    });
  });
});
