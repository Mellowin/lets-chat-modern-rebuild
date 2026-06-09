import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@lets-chat/database';
import { AuthService, AuthUserResponse } from './auth.service';

import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';

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
            updateInterfaceLanguage: jest.fn(),
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
            revokeAllForUser: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('7d'),
            get: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
            sendPasswordResetEmail: jest.fn(),
            sendEmailChangeConfirmationEmail: jest.fn(),
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
    };

    usersRepository.updateDisplayName.mockResolvedValue(user);

    const result = await service.updateMe('user-id', 'John Doe');

    expect(usersRepository.updateDisplayName).toHaveBeenCalledWith(
      'user-id',
      'John Doe',
    );
    expect(result.displayName).toBe('John Doe');
  });

  it('toAuthUserResponse includes displayName, avatar, and interfaceLanguage fields', () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: 'Jane Doe',
      avatarUrl: '/avatars/avatar-1.svg',
      avatarUpdatedAt: new Date('2024-01-01'),
      interfaceLanguage: 'uk',
      passwordHash: 'hash',
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
    };

    const servicePrivate = service as unknown as {
      toAuthUserResponse: (user: unknown) => AuthUserResponse;
    };
    const result = servicePrivate.toAuthUserResponse(user);

    expect(result.displayName).toBe('Jane Doe');
    expect(result.avatarUrl).toBe('/avatars/avatar-1.svg');
    expect(result.avatarUpdatedAt).toEqual(new Date('2024-01-01'));
    expect(result.interfaceLanguage).toBe('uk');
  });

  it('toAuthUserResponse defaults interfaceLanguage to en when missing', () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      passwordHash: 'hash',
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
    };

    const servicePrivate = service as unknown as {
      toAuthUserResponse: (user: unknown) => AuthUserResponse;
    };
    const result = servicePrivate.toAuthUserResponse(user);

    expect(result.avatarUrl).toBeNull();
    expect(result.avatarUpdatedAt).toBeNull();
    expect(result.interfaceLanguage).toBe('en');
  });

  it('updateInterfaceLanguage calls users.updateInterfaceLanguage and returns AuthUserResponse', async () => {
    const user = {
      id: 'user-id',
      email: 'u@test.com',
      username: 'user',
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      interfaceLanguage: 'ru',
      passwordHash: 'hash',
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
    };

    usersRepository.updateInterfaceLanguage.mockResolvedValue(user);

    const result = await service.updateInterfaceLanguage('user-id', 'ru');

    expect(usersRepository.updateInterfaceLanguage).toHaveBeenCalledWith(
      'user-id',
      'ru',
    );
    expect(result.interfaceLanguage).toBe('ru');
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
    };

    usersRepository.updateAvatar.mockResolvedValue(user);

    const result = await service.updateAvatar(
      'user-id',
      '/avatars/avatar-1.svg',
    );

    expect(result).not.toHaveProperty('passwordHash');
  });
});

describe('AuthService — email verification', () => {
  let service: AuthService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let passwordService: jest.Mocked<PasswordService>;
  let tokenService: jest.Mocked<TokenService>;
  let refreshTokensRepository: jest.Mocked<RefreshTokensRepository>;
  let mailService: jest.Mocked<MailService>;

  const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    avatarUrl: null,
    avatarUpdatedAt: null,
    interfaceLanguage: 'en',
    passwordHash: 'hash',
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
  });

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
            updateInterfaceLanguage: jest.fn(),
            updateEmailVerificationToken: jest.fn(),
            findByEmailVerificationTokenHash: jest.fn(),
            markEmailVerified: jest.fn(),
            findByPasswordResetTokenHash: jest.fn(),
            updatePasswordResetToken: jest.fn(),
            clearPasswordResetToken: jest.fn(),
            updatePassword: jest.fn(),
            findByEmailChangeTokenHash: jest.fn(),
            updateEmailChangeToken: jest.fn(),
            clearEmailChangeToken: jest.fn(),
            updateEmail: jest.fn(),
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
            revokeAllForUser: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('7d'),
            get: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    usersRepository = moduleRef.get(UsersRepository);
    passwordService = moduleRef.get(PasswordService);
    tokenService = moduleRef.get(TokenService);
    refreshTokensRepository = moduleRef.get(RefreshTokensRepository);
    mailService = moduleRef.get(MailService);
  });

  describe('register', () => {
    it('creates unverified user, sends email, and returns requiresEmailVerification', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.findByUsername.mockResolvedValue(null);
      passwordService.hashPassword.mockResolvedValue('hashed');
      usersRepository.createUser.mockResolvedValue(makeUser());
      usersRepository.updateEmailVerificationToken.mockResolvedValue(
        makeUser(),
      );
      mailService.sendVerificationEmail.mockResolvedValue(undefined);

      const result = await service.register({
        email: 'new@test.com',
        username: 'newuser',
        password: 'password123',
      });

      expect(result).toEqual({
        requiresEmailVerification: true,
        email: 'u@test.com',
      });
      expect(usersRepository.createUser).toHaveBeenCalledWith({
        email: 'new@test.com',
        username: 'newuser',
        passwordHash: 'hashed',
      });
      expect(usersRepository.updateEmailVerificationToken).toHaveBeenCalledWith(
        'user-id',
        expect.any(String),
        expect.any(Date),
        expect.any(Date),
      );
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith({
        to: 'u@test.com',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        token: expect.any(String),
      });
    });

    it('throws ConflictException when email already exists', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());

      await expect(
        service.register({
          email: 'u@test.com',
          username: 'newuser',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);

      expect(usersRepository.createUser).not.toHaveBeenCalled();
    });

    it('throws ConflictException when username already exists', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.findByUsername.mockResolvedValue(makeUser());

      await expect(
        service.register({
          email: 'new@test.com',
          username: 'user',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);

      expect(usersRepository.createUser).not.toHaveBeenCalled();
    });

    it('throws ConflictException on Prisma P2002 race condition', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.findByUsername.mockResolvedValue(null);
      passwordService.hashPassword.mockResolvedValue('hashed');

      const prismaError = new Prisma.PrismaClientKnownRequestError('P2002', {
        code: 'P2002',
        clientVersion: '5.22.0',
      });
      usersRepository.createUser.mockRejectedValue(prismaError);

      await expect(
        service.register({
          email: 'new@test.com',
          username: 'newuser',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens for verified user', async () => {
      const user = makeUser({ emailVerifiedAt: new Date() });
      usersRepository.findByEmail.mockResolvedValue(user);
      passwordService.verifyPassword.mockResolvedValue(true);
      tokenService.signAccessToken.mockResolvedValue('access-token');
      tokenService.signRefreshToken.mockResolvedValue('refresh-token');
      refreshTokensRepository.createToken.mockResolvedValue({
        count: 1,
      } as unknown as never);

      const result = await service.login({
        email: 'u@test.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user.id).toBe('user-id');
    });

    it('throws UnauthorizedException for invalid credentials (user not found)', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'u@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for invalid credentials (wrong password)', async () => {
      usersRepository.findByEmail.mockResolvedValue(
        makeUser({ emailVerifiedAt: new Date() }),
      );
      passwordService.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: 'u@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when email is not verified', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());
      passwordService.verifyPassword.mockResolvedValue(true);

      await expect(
        service.login({ email: 'u@test.com', password: 'password123' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('verifyEmail', () => {
    it('marks user as verified when token is valid and not expired', async () => {
      const user = makeUser({
        emailVerificationTokenHash: 'hash',
        emailVerificationExpiresAt: new Date(Date.now() + 3600_000),
      });
      usersRepository.findByEmailVerificationTokenHash.mockResolvedValue(user);
      usersRepository.markEmailVerified.mockResolvedValue(
        makeUser({ emailVerifiedAt: new Date() }),
      );

      const result = await service.verifyEmail('raw-token');

      expect(result).toEqual({ success: true });
      expect(usersRepository.markEmailVerified).toHaveBeenCalledWith('user-id');
    });

    it('throws NotFoundException when token is not found', async () => {
      usersRepository.findByEmailVerificationTokenHash.mockResolvedValue(null);

      await expect(service.verifyEmail('bad-token')).rejects.toThrow(
        NotFoundException,
      );
      expect(usersRepository.markEmailVerified).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when token is expired', async () => {
      const user = makeUser({
        emailVerificationTokenHash: 'hash',
        emailVerificationExpiresAt: new Date(Date.now() - 3600_000),
      });
      usersRepository.findByEmailVerificationTokenHash.mockResolvedValue(user);

      await expect(service.verifyEmail('raw-token')).rejects.toThrow(
        NotFoundException,
      );
      expect(usersRepository.markEmailVerified).not.toHaveBeenCalled();
    });
  });

  describe('resendVerification', () => {
    const genericMessage =
      'If the email exists and is not verified, a verification email has been sent.';

    it('sends new verification email when user exists and is unverified', async () => {
      const user = makeUser();
      usersRepository.findByEmail.mockResolvedValue(user);
      usersRepository.updateEmailVerificationToken.mockResolvedValue(user);
      mailService.sendVerificationEmail.mockResolvedValue(undefined);

      const result = await service.resendVerification('u@test.com');

      expect(result.message).toBe(genericMessage);
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('returns generic message when user not found', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      const result = await service.resendVerification('missing@test.com');

      expect(result.message).toBe(genericMessage);
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns generic message when user is already verified', async () => {
      usersRepository.findByEmail.mockResolvedValue(
        makeUser({ emailVerifiedAt: new Date() }),
      );

      const result = await service.resendVerification('u@test.com');

      expect(result.message).toBe(genericMessage);
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns generic message when cooldown is active', async () => {
      const user = makeUser({
        emailVerificationSentAt: new Date(Date.now() - 30_000),
      });
      usersRepository.findByEmail.mockResolvedValue(user);

      const result = await service.resendVerification('u@test.com');

      expect(result.message).toBe(genericMessage);
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('sends email when cooldown has passed', async () => {
      const user = makeUser({
        emailVerificationSentAt: new Date(Date.now() - 120_000),
      });
      usersRepository.findByEmail.mockResolvedValue(user);
      usersRepository.updateEmailVerificationToken.mockResolvedValue(user);
      mailService.sendVerificationEmail.mockResolvedValue(undefined);

      const result = await service.resendVerification('u@test.com');

      expect(result.message).toBe(genericMessage);
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
    });
  });
});

describe('AuthService — password reset', () => {
  let service: AuthService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let passwordService: jest.Mocked<PasswordService>;
  let mailService: jest.Mocked<MailService>;
  let refreshTokensRepository: jest.Mocked<RefreshTokensRepository>;

  const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    avatarUrl: null,
    avatarUpdatedAt: null,
    interfaceLanguage: 'en',
    passwordHash: 'hash',
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
  });

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
            updateInterfaceLanguage: jest.fn(),
            updateEmailVerificationToken: jest.fn(),
            findByEmailVerificationTokenHash: jest.fn(),
            markEmailVerified: jest.fn(),
            findByPasswordResetTokenHash: jest.fn(),
            updatePasswordResetToken: jest.fn(),
            clearPasswordResetToken: jest.fn(),
            updatePassword: jest.fn(),
            findByEmailChangeTokenHash: jest.fn(),
            updateEmailChangeToken: jest.fn(),
            clearEmailChangeToken: jest.fn(),
            updateEmail: jest.fn(),
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
            revokeAllForUser: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('7d'),
            get: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
            sendPasswordResetEmail: jest.fn(),
            sendEmailChangeConfirmationEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    usersRepository = moduleRef.get(UsersRepository);
    passwordService = moduleRef.get(PasswordService);
    mailService = moduleRef.get(MailService);
    refreshTokensRepository = moduleRef.get(RefreshTokensRepository);
  });

  describe('forgotPassword', () => {
    const genericMessage = 'If the email exists, a reset link has been sent.';

    it('returns generic message and sends reset email for existing user', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());
      usersRepository.updatePasswordResetToken.mockResolvedValue(makeUser());
      mailService.sendPasswordResetEmail.mockResolvedValue(undefined);

      const result = await service.forgotPassword('u@test.com');

      expect(result.message).toBe(genericMessage);
      expect(usersRepository.updatePasswordResetToken).toHaveBeenCalledWith(
        'user-id',
        expect.any(String),
        expect.any(Date),
        expect.any(Date),
      );
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith({
        to: 'u@test.com',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        token: expect.any(String),
      });
    });

    it('returns generic message when user not found without sending email', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword('missing@test.com');

      expect(result.message).toBe(genericMessage);
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates password and clears token for valid token with different password', async () => {
      const user = makeUser({
        passwordResetTokenHash: 'hash',
        passwordResetExpiresAt: new Date(Date.now() + 3600_000),
      });
      usersRepository.findByPasswordResetTokenHash.mockResolvedValue(user);
      passwordService.verifyPassword.mockResolvedValue(false);
      passwordService.hashPassword.mockResolvedValue('new-hash');
      usersRepository.updatePassword.mockResolvedValue(makeUser());
      usersRepository.clearPasswordResetToken.mockResolvedValue(makeUser());

      const result = await service.resetPassword('raw-token', 'newpass123');

      expect(result).toEqual({ success: true });
      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        'newpass123',
        'hash',
      );
      expect(passwordService.hashPassword).toHaveBeenCalledWith('newpass123');
      expect(usersRepository.updatePassword).toHaveBeenCalledWith(
        'user-id',
        'new-hash',
      );
      expect(usersRepository.clearPasswordResetToken).toHaveBeenCalledWith(
        'user-id',
      );
      expect(refreshTokensRepository.revokeAllForUser).toHaveBeenCalledWith(
        'user-id',
      );
    });

    it('throws BadRequestException when new password equals current password', async () => {
      const user = makeUser({
        passwordResetTokenHash: 'hash',
        passwordResetExpiresAt: new Date(Date.now() + 3600_000),
      });
      usersRepository.findByPasswordResetTokenHash.mockResolvedValue(user);
      passwordService.verifyPassword.mockResolvedValue(true);

      await expect(
        service.resetPassword('raw-token', 'samepassword'),
      ).rejects.toThrow(BadRequestException);

      expect(passwordService.verifyPassword).toHaveBeenCalledWith(
        'samepassword',
        'hash',
      );
      expect(passwordService.hashPassword).not.toHaveBeenCalled();
      expect(usersRepository.updatePassword).not.toHaveBeenCalled();
      expect(usersRepository.clearPasswordResetToken).not.toHaveBeenCalled();
      expect(refreshTokensRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for invalid token', async () => {
      usersRepository.findByPasswordResetTokenHash.mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'newpass'),
      ).rejects.toThrow(NotFoundException);

      expect(refreshTokensRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for expired token', async () => {
      const user = makeUser({
        passwordResetTokenHash: 'hash',
        passwordResetExpiresAt: new Date(Date.now() - 3600_000),
      });
      usersRepository.findByPasswordResetTokenHash.mockResolvedValue(user);

      await expect(
        service.resetPassword('raw-token', 'newpass'),
      ).rejects.toThrow(NotFoundException);

      expect(refreshTokensRepository.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('requestEmailChange', () => {
    it('stores pending email and sends confirmation for valid new email', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.updateEmailChangeToken.mockResolvedValue(makeUser());
      mailService.sendEmailChangeConfirmationEmail.mockResolvedValue(undefined);

      const result = await service.requestEmailChange(
        'user-id',
        'new@example.com',
      );

      expect(result.message).toBe(
        'Check your new email to confirm the change.',
      );
      expect(usersRepository.updateEmailChangeToken).toHaveBeenCalledWith(
        'user-id',
        'new@example.com',
        expect.any(String),
        expect.any(Date),
        expect.any(Date),
      );
      expect(mailService.sendEmailChangeConfirmationEmail).toHaveBeenCalledWith(
        {
          to: 'new@example.com',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          token: expect.any(String),
        },
      );
    });

    it('throws ConflictException when new email is already used by another user', async () => {
      usersRepository.findByEmail.mockResolvedValue(
        makeUser({ id: 'other-id' }),
      );

      await expect(
        service.requestEmailChange('user-id', 'u@test.com'),
      ).rejects.toThrow(ConflictException);
    });

    it('allows same email for same user', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());
      usersRepository.updateEmailChangeToken.mockResolvedValue(makeUser());
      mailService.sendEmailChangeConfirmationEmail.mockResolvedValue(undefined);

      const result = await service.requestEmailChange('user-id', 'u@test.com');

      expect(result.message).toBe(
        'Check your new email to confirm the change.',
      );
    });
  });

  describe('confirmEmailChange', () => {
    it('updates email and clears token for valid token', async () => {
      const user = makeUser({
        pendingEmail: 'new@example.com',
        emailChangeTokenHash: 'hash',
        emailChangeExpiresAt: new Date(Date.now() + 3600_000),
      });
      usersRepository.findByEmailChangeTokenHash.mockResolvedValue(user);
      usersRepository.findByEmail.mockResolvedValue(null);
      usersRepository.updateEmail.mockResolvedValue(
        makeUser({ email: 'new@example.com' }),
      );
      usersRepository.clearEmailChangeToken.mockResolvedValue(makeUser());

      const result = await service.confirmEmailChange('raw-token');

      expect(result).toEqual({ success: true });
      expect(usersRepository.updateEmail).toHaveBeenCalledWith(
        'user-id',
        'new@example.com',
      );
      expect(usersRepository.clearEmailChangeToken).toHaveBeenCalledWith(
        'user-id',
      );
    });

    it('throws NotFoundException for invalid token', async () => {
      usersRepository.findByEmailChangeTokenHash.mockResolvedValue(null);

      await expect(service.confirmEmailChange('bad-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for expired token', async () => {
      const user = makeUser({
        pendingEmail: 'new@example.com',
        emailChangeTokenHash: 'hash',
        emailChangeExpiresAt: new Date(Date.now() - 3600_000),
      });
      usersRepository.findByEmailChangeTokenHash.mockResolvedValue(user);

      await expect(service.confirmEmailChange('raw-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when pending email was taken by another user', async () => {
      const user = makeUser({
        pendingEmail: 'new@example.com',
        emailChangeTokenHash: 'hash',
        emailChangeExpiresAt: new Date(Date.now() + 3600_000),
      });
      usersRepository.findByEmailChangeTokenHash.mockResolvedValue(user);
      usersRepository.findByEmail.mockResolvedValue(
        makeUser({ id: 'other-id' }),
      );

      await expect(service.confirmEmailChange('raw-token')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});

describe('AuthService — change password', () => {
  let service: AuthService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let passwordService: jest.Mocked<PasswordService>;
  let refreshTokensRepository: jest.Mocked<RefreshTokensRepository>;

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
            updateInterfaceLanguage: jest.fn(),
            updatePassword: jest.fn(),
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
            revokeAllForUser: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('7d'),
            get: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendVerificationEmail: jest.fn(),
            sendPasswordResetEmail: jest.fn(),
            sendEmailChangeConfirmationEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    usersRepository = moduleRef.get(UsersRepository);
    passwordService = moduleRef.get(PasswordService);
    refreshTokensRepository = moduleRef.get(RefreshTokensRepository);
  });

  const makeUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'user-id',
    email: 'u@test.com',
    username: 'user',
    displayName: null,
    avatarUrl: null,
    avatarUpdatedAt: null,
    interfaceLanguage: 'en',
    passwordHash: 'hash',
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
  });

  it('updates password when current password is correct and new password is different', async () => {
    const user = makeUser();
    usersRepository.findById.mockResolvedValue(user);
    passwordService.verifyPassword.mockResolvedValueOnce(true);
    passwordService.verifyPassword.mockResolvedValueOnce(false);
    passwordService.hashPassword.mockResolvedValue('new-hash');
    usersRepository.updatePassword.mockResolvedValue(makeUser());

    const result = await service.changePassword(
      'user-id',
      'oldpass123',
      'newpass123',
    );

    expect(result).toEqual({ success: true });
    expect(passwordService.verifyPassword).toHaveBeenNthCalledWith(
      1,
      'oldpass123',
      'hash',
    );
    expect(passwordService.verifyPassword).toHaveBeenNthCalledWith(
      2,
      'newpass123',
      'hash',
    );
    expect(passwordService.hashPassword).toHaveBeenCalledWith('newpass123');
    expect(usersRepository.updatePassword).toHaveBeenCalledWith(
      'user-id',
      'new-hash',
    );
    expect(refreshTokensRepository.revokeAllForUser).toHaveBeenCalledWith(
      'user-id',
    );
  });

  it('throws BadRequestException when current password is incorrect', async () => {
    const user = makeUser();
    usersRepository.findById.mockResolvedValue(user);
    passwordService.verifyPassword.mockResolvedValueOnce(false);

    await expect(
      service.changePassword('user-id', 'wrongpass', 'newpass123'),
    ).rejects.toThrow(BadRequestException);

    expect(passwordService.hashPassword).not.toHaveBeenCalled();
    expect(usersRepository.updatePassword).not.toHaveBeenCalled();
    expect(refreshTokensRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when new password equals current password', async () => {
    const user = makeUser();
    usersRepository.findById.mockResolvedValue(user);
    passwordService.verifyPassword.mockResolvedValueOnce(true);
    passwordService.verifyPassword.mockResolvedValueOnce(true);

    await expect(
      service.changePassword('user-id', 'samepass', 'samepass'),
    ).rejects.toThrow('New password must be different from current password');

    expect(passwordService.hashPassword).not.toHaveBeenCalled();
    expect(usersRepository.updatePassword).not.toHaveBeenCalled();
    expect(refreshTokensRepository.revokeAllForUser).not.toHaveBeenCalled();
  });
});
