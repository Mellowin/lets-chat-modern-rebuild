import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  createMailProviderQuotaExceededException,
  createMailProviderUnavailableException,
  MailProviderException,
} from './mail-provider.exception';

export interface SendVerificationEmailInput {
  to: string;
  token: string;
}

export interface SendPasswordResetEmailInput {
  to: string;
  token: string;
}

export interface SendEmailChangeConfirmationEmailInput {
  to: string;
  token: string;
}

type EmailType = 'verification' | 'passwordReset' | 'emailChange';

interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

interface MailSendInput {
  to: string;
  token: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationEmail(
    input: SendVerificationEmailInput,
  ): Promise<void> {
    return this.sendWithFallback(input, 'verification');
  }

  async sendPasswordResetEmail(
    input: SendPasswordResetEmailInput,
  ): Promise<void> {
    return this.sendWithFallback(input, 'passwordReset');
  }

  async sendEmailChangeConfirmationEmail(
    input: SendEmailChangeConfirmationEmailInput,
  ): Promise<void> {
    return this.sendWithFallback(input, 'emailChange');
  }

  previewTemplate(type: string): EmailTemplate {
    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL');

    switch (type) {
      case 'verify':
        return this.buildVerificationTemplate(
          `${webUrl}/verify-email?token=preview-token`,
        );
      case 'reset':
        return this.buildPasswordResetTemplate(
          `${webUrl}/reset-password?token=preview-token`,
        );
      case 'email-change':
        return this.buildEmailChangeTemplate(
          `${webUrl}/confirm-email-change?token=preview-token`,
        );
      default:
        throw new BadRequestException('Unknown preview type');
    }
  }

  private async sendWithFallback(
    input: MailSendInput,
    emailType: EmailType,
  ): Promise<void> {
    const provider = this.config.get<string>('MAIL_PROVIDER', 'console');

    if (provider === 'console') {
      return this.sendViaConsole(input, emailType);
    }

    const primary = this.resolvePrimarySender(provider);
    const fallback = this.resolveFallbackSender(provider);

    try {
      await primary(input, emailType);
      return;
    } catch (error) {
      const shouldFallback =
        error instanceof MailProviderException &&
        error.retryable &&
        fallback !== undefined;

      if (!shouldFallback) {
        throw error;
      }

      this.logger.warn(
        {
          context: emailType,
          primaryProvider: provider,
          fallbackProvider: 'smtp',
          reason: 'primary_failed_trying_fallback',
        },
        'Primary mail provider failed, trying SMTP fallback',
      );
    }

    try {
      await fallback(input, emailType);
      this.logger.log(
        {
          context: emailType,
          fallbackProvider: 'smtp',
          reason: 'fallback_succeeded',
        },
        'SMTP fallback delivered email',
      );
    } catch {
      this.logger.error(
        { context: emailType, reason: 'fallback_failed' },
        'SMTP fallback also failed',
      );
      throw createMailProviderUnavailableException(false);
    }
  }

  private resolvePrimarySender(
    provider: string,
  ): (input: MailSendInput, emailType: EmailType) => Promise<void> {
    switch (provider) {
      case 'resend':
        return (input, emailType) => this.sendViaResend(input, emailType);
      case 'smtp':
        return (input, emailType) => this.sendViaSmtp(input, emailType);
      default:
        throw createMailProviderUnavailableException(false);
    }
  }

  private resolveFallbackSender(
    primaryProvider: string,
  ):
    | ((input: MailSendInput, emailType: EmailType) => Promise<void>)
    | undefined {
    const fallbackProvider = this.config.get<string>('MAIL_FALLBACK_PROVIDER');
    if (fallbackProvider !== 'smtp' || primaryProvider === 'smtp') {
      return undefined;
    }
    if (!this.isSmtpConfigured()) {
      return undefined;
    }
    return (input, emailType) => this.sendViaSmtp(input, emailType);
  }

  private isSmtpConfigured(): boolean {
    return (
      this.hasConfig('SMTP_HOST') &&
      this.hasConfig('SMTP_USER') &&
      this.hasConfig('SMTP_PASS') &&
      this.hasConfig('SMTP_FROM')
    );
  }

  private hasConfig(key: string): boolean {
    const value = this.config.get<string>(key);
    return typeof value === 'string' && value.length > 0;
  }

  private buildLink(token: string, emailType: EmailType): string {
    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL');
    const pathMap: Record<EmailType, string> = {
      verification: 'verify-email',
      passwordReset: 'reset-password',
      emailChange: 'confirm-email-change',
    };
    return `${webUrl}/${pathMap[emailType]}?token=${token}`;
  }

  private buildTemplate(link: string, emailType: EmailType): EmailTemplate {
    switch (emailType) {
      case 'verification':
        return this.buildVerificationTemplate(link);
      case 'passwordReset':
        return this.buildPasswordResetTemplate(link);
      case 'emailChange':
        return this.buildEmailChangeTemplate(link);
    }
  }

  private sendViaConsole(input: MailSendInput, emailType: EmailType): void {
    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL');
    const pathMap: Record<EmailType, string> = {
      verification: 'verify-email',
      passwordReset: 'reset-password',
      emailChange: 'confirm-email-change',
    };
    const link = `${webUrl}/${pathMap[emailType]}?token=${input.token}`;

    const labelMap: Record<EmailType, string> = {
      verification: 'Verification email',
      passwordReset: 'Password reset email',
      emailChange: 'Email change confirmation',
    };

    this.logger.log(
      `[DEV MAIL] ${labelMap[emailType]} to ${input.to}: ${link}`,
    );
  }

  private async sendViaResend(
    input: MailSendInput,
    emailType: EmailType,
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');

    if (!apiKey || !from) {
      throw new Error(
        'Resend mail provider requires RESEND_API_KEY and MAIL_FROM to be configured',
      );
    }

    const link = this.buildLink(input.token, emailType);
    const template = this.buildTemplate(link, emailType);

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: input.to,
          subject: template.subject,
          text: template.text,
          html: template.html,
        }),
      });
    } catch {
      this.logger.error(
        {
          context: emailType,
          provider: 'resend',
          reason: 'network_error',
        },
        'Resend API request failed',
      );
      throw createMailProviderUnavailableException(true);
    }

    if (!response.ok) {
      await this.handleResendError(response, emailType);
    }
  }

  private async sendViaSmtp(
    input: MailSendInput,
    emailType: EmailType,
  ): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const port = this.config.get<number>('SMTP_PORT', 587);
    const secureValue = this.config.get<boolean | string>('SMTP_SECURE');
    const secure =
      secureValue === true || secureValue === 'true' || port === 465;
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const from = this.config.get<string>('SMTP_FROM');

    if (!host || !user || !pass || !from) {
      throw new Error(
        'SMTP provider requires SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM to be configured',
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const link = this.buildLink(input.token, emailType);
    const template = this.buildTemplate(link, emailType);

    try {
      await transporter.sendMail({
        from,
        to: input.to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
    } catch {
      this.logger.error(
        {
          context: emailType,
          provider: 'smtp',
          reason: 'smtp_send_failed',
        },
        'SMTP send failed',
      );
      throw createMailProviderUnavailableException(false);
    }
  }

  private async handleResendError(
    response: Response,
    emailType: EmailType,
  ): Promise<never> {
    let bodyText = 'unknown error';
    let bodyJson: Record<string, unknown> | undefined;

    try {
      bodyText = await response.text();
      bodyJson = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      // Keep bodyText as the raw text if JSON parsing fails.
    }

    const isQuotaExceeded =
      response.status === 429 ||
      bodyJson?.name === 'daily_quota_exceeded' ||
      (typeof bodyJson?.message === 'string' &&
        bodyJson.message.toLowerCase().includes('quota'));

    // Do not retry client-level errors (bad request, unauthorized, invalid payload).
    const isClientError = response.status >= 400 && response.status < 500;
    const retryable = isQuotaExceeded || !isClientError;

    this.logger.error(
      {
        context: emailType,
        provider: 'resend',
        providerStatus: response.status,
        providerErrorName: bodyJson?.name,
        reason: isQuotaExceeded
          ? 'mail_provider_quota_exceeded'
          : 'mail_provider_error',
        retryable,
      },
      'Resend API request failed',
    );

    if (isQuotaExceeded) {
      throw createMailProviderQuotaExceededException();
    }

    throw createMailProviderUnavailableException(retryable);
  }

  private buildVerificationTemplate(link: string): EmailTemplate {
    return {
      subject: 'Verify your email address for Lets Chat',
      text: `Welcome to Lets Chat!\n\nPlease verify your email address by clicking the link below:\n\n${link}\n\nIf you did not create an account, you can safely ignore this email.`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify your email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: #f9f9f9; border-radius: 8px; padding: 30px;">
<h2 style="color: #111; margin-top: 0;">Welcome to Lets Chat</h2>
<p>Please verify your email address to complete your registration.</p>
<div style="text-align: center; margin: 30px 0;">
<a href="${link}" style="background: #111; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; display: inline-block; font-weight: bold;">Verify Email Address</a>
</div>
<p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
<p style="font-size: 14px; word-break: break-all; color: #666;">${link}</p>
<p style="font-size: 13px; color: #999; margin-top: 30px;">If you did not create an account, you can safely ignore this email.</p>
</div>
</body>
</html>`,
    };
  }

  private buildPasswordResetTemplate(link: string): EmailTemplate {
    return {
      subject: 'Reset your Lets Chat password',
      text: `You requested a password reset for your Lets Chat account.\n\nClick the link below to reset your password:\n\n${link}\n\nIf you did not request a password reset, you can safely ignore this email.`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset your password</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: #f9f9f9; border-radius: 8px; padding: 30px;">
<h2 style="color: #111; margin-top: 0;">Reset Your Password</h2>
<p>You requested a password reset for your Lets Chat account. Click the button below to set a new password.</p>
<div style="text-align: center; margin: 30px 0;">
<a href="${link}" style="background: #111; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; display: inline-block; font-weight: bold;">Reset Password</a>
</div>
<p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
<p style="font-size: 14px; word-break: break-all; color: #666;">${link}</p>
<p style="font-size: 13px; color: #999; margin-top: 30px;">If you did not request a password reset, you can safely ignore this email.</p>
</div>
</body>
</html>`,
    };
  }

  private buildEmailChangeTemplate(link: string): EmailTemplate {
    return {
      subject: 'Confirm your email change for Lets Chat',
      text: `You requested to change the email address for your Lets Chat account.\n\nClick the link below to confirm this change:\n\n${link}\n\nIf you did not request this change, you can safely ignore this email.`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Confirm email change</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: #f9f9f9; border-radius: 8px; padding: 30px;">
<h2 style="color: #111; margin-top: 0;">Confirm Email Change</h2>
<p>You requested to change the email address for your Lets Chat account. Click the button below to confirm.</p>
<div style="text-align: center; margin: 30px 0;">
<a href="${link}" style="background: #111; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; display: inline-block; font-weight: bold;">Confirm Email Change</a>
</div>
<p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
<p style="font-size: 14px; word-break: break-all; color: #666;">${link}</p>
<p style="font-size: 13px; color: #999; margin-top: 30px;">If you did not request this change, you can safely ignore this email.</p>
</div>
</body>
</html>`,
    };
  }
}
