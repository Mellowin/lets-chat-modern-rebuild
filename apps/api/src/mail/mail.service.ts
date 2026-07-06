import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createMailProviderQuotaExceededException,
  createMailProviderUnavailableException,
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

interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  private async handleResendError(
    response: Response,
    context: string,
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

    this.logger.error(
      {
        context,
        providerStatus: response.status,
        providerErrorName: bodyJson?.name,
        reason: isQuotaExceeded
          ? 'mail_provider_quota_exceeded'
          : 'mail_provider_error',
      },
      'Resend API request failed',
    );

    if (isQuotaExceeded) {
      throw createMailProviderQuotaExceededException();
    }

    throw createMailProviderUnavailableException();
  }

  async sendVerificationEmail(
    input: SendVerificationEmailInput,
  ): Promise<void> {
    const provider = this.config.get<string>('MAIL_PROVIDER', 'console');

    switch (provider) {
      case 'resend':
        return this.sendViaResend(input);
      case 'console':
      default:
        return this.sendViaConsole(input);
    }
  }

  async sendPasswordResetEmail(
    input: SendPasswordResetEmailInput,
  ): Promise<void> {
    const provider = this.config.get<string>('MAIL_PROVIDER', 'console');

    switch (provider) {
      case 'resend':
        return this.sendPasswordResetViaResend(input);
      case 'console':
      default:
        return this.sendPasswordResetViaConsole(input);
    }
  }

  async sendEmailChangeConfirmationEmail(
    input: SendEmailChangeConfirmationEmailInput,
  ): Promise<void> {
    const provider = this.config.get<string>('MAIL_PROVIDER', 'console');

    switch (provider) {
      case 'resend':
        return this.sendEmailChangeViaResend(input);
      case 'console':
      default:
        return this.sendEmailChangeViaConsole(input);
    }
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

  private sendViaConsole(input: SendVerificationEmailInput): void {
    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL');
    const link = `${webUrl}/verify-email?token=${input.token}`;

    this.logger.log(`[DEV MAIL] Verification email to ${input.to}: ${link}`);
  }

  private async sendViaResend(
    input: SendVerificationEmailInput,
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL');

    if (!apiKey || !from) {
      throw new Error(
        'Resend mail provider requires RESEND_API_KEY and MAIL_FROM to be configured',
      );
    }

    const link = `${webUrl}/verify-email?token=${input.token}`;
    const template = this.buildVerificationTemplate(link);

    const response = await fetch('https://api.resend.com/emails', {
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

    if (!response.ok) {
      await this.handleResendError(response, 'sendVerificationEmail');
    }
  }

  private sendPasswordResetViaConsole(
    input: SendPasswordResetEmailInput,
  ): void {
    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL');
    const link = `${webUrl}/reset-password?token=${input.token}`;

    this.logger.log(`[DEV MAIL] Password reset email to ${input.to}: ${link}`);
  }

  private async sendPasswordResetViaResend(
    input: SendPasswordResetEmailInput,
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL');

    if (!apiKey || !from) {
      throw new Error(
        'Resend mail provider requires RESEND_API_KEY and MAIL_FROM to be configured',
      );
    }

    const link = `${webUrl}/reset-password?token=${input.token}`;
    const template = this.buildPasswordResetTemplate(link);

    const response = await fetch('https://api.resend.com/emails', {
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

    if (!response.ok) {
      await this.handleResendError(response, 'sendPasswordResetEmail');
    }
  }

  private sendEmailChangeViaConsole(
    input: SendEmailChangeConfirmationEmailInput,
  ): void {
    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL');
    const link = `${webUrl}/confirm-email-change?token=${input.token}`;

    this.logger.log(
      `[DEV MAIL] Email change confirmation to ${input.to}: ${link}`,
    );
  }

  private async sendEmailChangeViaResend(
    input: SendEmailChangeConfirmationEmailInput,
  ): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    const webUrl = this.config.getOrThrow<string>('APP_WEB_URL');

    if (!apiKey || !from) {
      throw new Error(
        'Resend mail provider requires RESEND_API_KEY and MAIL_FROM to be configured',
      );
    }

    const link = `${webUrl}/confirm-email-change?token=${input.token}`;
    const template = this.buildEmailChangeTemplate(link);

    const response = await fetch('https://api.resend.com/emails', {
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

    if (!response.ok) {
      await this.handleResendError(
        response,
        'sendEmailChangeConfirmationEmail',
      );
    }
  }
}
