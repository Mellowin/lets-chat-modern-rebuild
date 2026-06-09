import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { MailService } from './mail.service';

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

    it('throws when Resend API returns non-2xx', async () => {
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
      ).rejects.toThrow('Resend API error: 422 invalid email');
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
        body: expect.stringContaining('Confirm your email change for Lets Chat'),
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
