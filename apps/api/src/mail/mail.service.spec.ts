import { Test } from '@nestjs/testing';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import {
  MailProviderException,
  MAIL_PROVIDER_ERROR_CODES,
} from './mail-provider.exception';

describe('MailService', () => {
  let service: MailService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(MailService);
    configService = moduleRef.get(ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('logs verification link via console provider by default', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MAIL_PROVIDER') return 'console';
        return undefined;
      });
      configService.getOrThrow.mockImplementation((key: string) => {
        if (key === 'APP_WEB_URL') return 'http://localhost:3000';
        throw new Error(`Missing ${key}`);
      });

      const loggerSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      await service.sendVerificationEmail({
        to: 'user@example.com',
        token: 'abc123',
      });

      expect(configService.get).toHaveBeenCalledWith(
        'MAIL_PROVIDER',
        'console',
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[DEV MAIL] Verification email to user@example.com',
        ),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'http://localhost:3000/verify-email?token=abc123',
        ),
      );
    });

    it('uses APP_WEB_URL from config for console link', async () => {
      configService.get.mockReturnValue('console');
      configService.getOrThrow.mockReturnValue('https://app.example.com');

      const loggerSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => {});

      await service.sendVerificationEmail({
        to: 'user@example.com',
        token: 'xyz789',
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://app.example.com/verify-email?token=xyz789',
        ),
      );
    });

    it('throws when resend provider is selected but RESEND_API_KEY is missing', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MAIL_PROVIDER') return 'resend';
        if (key === 'RESEND_API_KEY') return undefined;
        if (key === 'MAIL_FROM') return 'noreply@example.com';
        return undefined;
      });
      configService.getOrThrow.mockReturnValue('http://localhost:3000');

      await expect(
        service.sendVerificationEmail({ to: 'user@example.com', token: 'abc' }),
      ).rejects.toThrow(
        'Resend mail provider requires RESEND_API_KEY and MAIL_FROM',
      );
    });

    it('throws when resend provider is selected but MAIL_FROM is missing', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MAIL_PROVIDER') return 'resend';
        if (key === 'RESEND_API_KEY') return 're_123';
        if (key === 'MAIL_FROM') return undefined;
        return undefined;
      });
      configService.getOrThrow.mockReturnValue('http://localhost:3000');

      await expect(
        service.sendVerificationEmail({ to: 'user@example.com', token: 'abc' }),
      ).rejects.toThrow(
        'Resend mail provider requires RESEND_API_KEY and MAIL_FROM',
      );
    });

    it('calls Resend API when provider is resend and config is valid', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MAIL_PROVIDER') return 'resend';
        if (key === 'RESEND_API_KEY') return 're_123';
        if (key === 'MAIL_FROM') return 'noreply@example.com';
        return undefined;
      });
      configService.getOrThrow.mockReturnValue('http://localhost:3000');

      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      await service.sendVerificationEmail({
        to: 'user@example.com',
        token: 'abc123',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer re_123',
            'Content-Type': 'application/json',
          },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          body: expect.stringContaining('user@example.com'),
        }),
      );

      const body = JSON.parse(
        fetchSpy.mock.calls[0][1]!.body as string,
      ) as Record<string, unknown>;
      expect(body.from).toBe('noreply@example.com');
      expect(body.to).toBe('user@example.com');
      expect(body.subject).toBe('Verify your email address for Lets Chat');
      expect(body.text).toContain(
        'http://localhost:3000/verify-email?token=abc123',
      );
      expect(body.html).toContain(
        'http://localhost:3000/verify-email?token=abc123',
      );
      expect(body.html).toContain('Verify Email Address');
    });

    it('throws safe MailProviderException when Resend API returns non-2xx', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MAIL_PROVIDER') return 'resend';
        if (key === 'RESEND_API_KEY') return 're_123';
        if (key === 'MAIL_FROM') return 'noreply@example.com';
        return undefined;
      });
      configService.getOrThrow.mockReturnValue('http://localhost:3000');

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve('invalid email'),
      } as Response);

      await expect(
        service.sendVerificationEmail({ to: 'user@example.com', token: 'abc' }),
      ).rejects.toThrow(MailProviderException);

      await expect(
        service.sendVerificationEmail({ to: 'user@example.com', token: 'abc' }),
      ).rejects.toMatchObject({
        status: 503,
        response: {
          error: MAIL_PROVIDER_ERROR_CODES.UNAVAILABLE,
          message:
            'Email delivery is temporarily unavailable. Please try again later.',
        },
      });
    });

    it('throws quota exceeded exception when Resend returns 429 daily_quota_exceeded', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MAIL_PROVIDER') return 'resend';
        if (key === 'RESEND_API_KEY') return 're_123';
        if (key === 'MAIL_FROM') return 'noreply@example.com';
        return undefined;
      });
      configService.getOrThrow.mockReturnValue('http://localhost:3000');

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              statusCode: 429,
              message: 'You have reached your daily email sending quota.',
              name: 'daily_quota_exceeded',
            }),
          ),
      } as Response);

      await expect(
        service.sendVerificationEmail({ to: 'user@example.com', token: 'abc' }),
      ).rejects.toThrow(MailProviderException);

      await expect(
        service.sendVerificationEmail({ to: 'user@example.com', token: 'abc' }),
      ).rejects.toMatchObject({
        status: 503,
        response: {
          error: MAIL_PROVIDER_ERROR_CODES.QUOTA_EXCEEDED,
          message:
            'Email delivery is temporarily unavailable. Please try again later.',
        },
      });
    });

    it('does not expose Resend API key or raw response to the client on error', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'MAIL_PROVIDER') return 'resend';
        if (key === 'RESEND_API_KEY') return 're_secret_key';
        if (key === 'MAIL_FROM') return 'noreply@example.com';
        return undefined;
      });
      configService.getOrThrow.mockReturnValue('http://localhost:3000');

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              statusCode: 429,
              message: 'You have reached your daily email sending quota.',
              name: 'daily_quota_exceeded',
            }),
          ),
      } as Response);

      let thrown: MailProviderException | undefined;
      try {
        await service.sendVerificationEmail({
          to: 'user@example.com',
          token: 'abc',
        });
      } catch (err) {
        thrown = err as MailProviderException;
      }

      expect(thrown).toBeInstanceOf(MailProviderException);
      const response = thrown!.getResponse() as Record<string, unknown>;
      const responseText = JSON.stringify(response);
      expect(responseText).not.toContain('re_secret_key');
      expect(responseText).not.toContain('daily_quota_exceeded');
      expect(responseText).not.toContain('token');
    });
  });
});

describe('MailService — password reset', () => {
  let service: MailService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(MailService);
    configService = moduleRef.get(ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs password reset link via console provider', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'MAIL_PROVIDER') return 'console';
      return undefined;
    });
    configService.getOrThrow.mockReturnValue('http://localhost:3000');

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});

    await service.sendPasswordResetEmail({
      to: 'user@example.com',
      token: 'reset123',
    });

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[DEV MAIL] Password reset email to user@example.com',
      ),
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'http://localhost:3000/reset-password?token=reset123',
      ),
    );
  });

  it('calls Resend API for password reset', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'MAIL_PROVIDER') return 'resend';
      if (key === 'RESEND_API_KEY') return 're_123';
      if (key === 'MAIL_FROM') return 'noreply@example.com';
      return undefined;
    });
    configService.getOrThrow.mockReturnValue('http://localhost:3000');

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    await service.sendPasswordResetEmail({
      to: 'user@example.com',
      token: 'reset123',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.stringContaining('Reset your Lets Chat password'),
      }),
    );

    const body = JSON.parse(
      fetchSpy.mock.calls[0][1]!.body as string,
    ) as Record<string, unknown>;
    expect(body.to).toBe('user@example.com');
    expect(body.subject).toBe('Reset your Lets Chat password');
    expect(body.text).toContain(
      'http://localhost:3000/reset-password?token=reset123',
    );
    expect(body.html).toContain(
      'http://localhost:3000/reset-password?token=reset123',
    );
    expect(body.html).toContain('Reset Password');
  });
});

describe('MailService — email change confirmation', () => {
  let service: MailService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(MailService);
    configService = moduleRef.get(ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs email change link via console provider', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'MAIL_PROVIDER') return 'console';
      return undefined;
    });
    configService.getOrThrow.mockReturnValue('http://localhost:3000');

    const loggerSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});

    await service.sendEmailChangeConfirmationEmail({
      to: 'new@example.com',
      token: 'change123',
    });

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[DEV MAIL] Email change confirmation to new@example.com',
      ),
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'http://localhost:3000/confirm-email-change?token=change123',
      ),
    );
  });

  it('calls Resend API for email change confirmation', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'MAIL_PROVIDER') return 'resend';
      if (key === 'RESEND_API_KEY') return 're_123';
      if (key === 'MAIL_FROM') return 'noreply@example.com';
      return undefined;
    });
    configService.getOrThrow.mockReturnValue('http://localhost:3000');

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    await service.sendEmailChangeConfirmationEmail({
      to: 'new@example.com',
      token: 'change123',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.stringContaining(
          'Confirm your email change for Lets Chat',
        ),
      }),
    );

    const body = JSON.parse(
      fetchSpy.mock.calls[0][1]!.body as string,
    ) as Record<string, unknown>;
    expect(body.to).toBe('new@example.com');
    expect(body.subject).toBe('Confirm your email change for Lets Chat');
    expect(body.text).toContain(
      'http://localhost:3000/confirm-email-change?token=change123',
    );
    expect(body.html).toContain(
      'http://localhost:3000/confirm-email-change?token=change123',
    );
    expect(body.html).toContain('Confirm Email Change');
  });
});

describe('MailService — previewTemplate', () => {
  let service: MailService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(MailService);
    configService = moduleRef.get(ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns verification template with APP_WEB_URL link', () => {
    configService.getOrThrow.mockReturnValue('https://app.example.com');

    const result = service.previewTemplate('verify');

    expect(result.subject).toBe('Verify your email address for Lets Chat');
    expect(result.html).toContain('Verify Email Address');
    expect(result.html).toContain(
      'https://app.example.com/verify-email?token=preview-token',
    );
    expect(result.text).toContain(
      'https://app.example.com/verify-email?token=preview-token',
    );
  });

  it('returns password reset template with APP_WEB_URL link', () => {
    configService.getOrThrow.mockReturnValue('https://app.example.com');

    const result = service.previewTemplate('reset');

    expect(result.subject).toBe('Reset your Lets Chat password');
    expect(result.html).toContain('Reset Password');
    expect(result.html).toContain(
      'https://app.example.com/reset-password?token=preview-token',
    );
    expect(result.text).toContain(
      'https://app.example.com/reset-password?token=preview-token',
    );
  });

  it('returns email change template with APP_WEB_URL link', () => {
    configService.getOrThrow.mockReturnValue('https://app.example.com');

    const result = service.previewTemplate('email-change');

    expect(result.subject).toBe('Confirm your email change for Lets Chat');
    expect(result.html).toContain('Confirm Email Change');
    expect(result.html).toContain(
      'https://app.example.com/confirm-email-change?token=preview-token',
    );
    expect(result.text).toContain(
      'https://app.example.com/confirm-email-change?token=preview-token',
    );
  });

  it('throws BadRequestException for unknown type', () => {
    configService.getOrThrow.mockReturnValue('https://app.example.com');

    expect(() => service.previewTemplate('unknown')).toThrow(
      BadRequestException,
    );
  });
});
