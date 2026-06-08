import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

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

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: 'Verify your email address',
        html: `<p>Click the link below to verify your email address:</p><p><a href="${link}">${link}</a></p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown error');
      throw new Error(`Resend API error: ${response.status} ${body}`);
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

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: 'Reset your password',
        html: `<p>Click the link below to reset your password:</p><p><a href="${link}">${link}</a></p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown error');
      throw new Error(`Resend API error: ${response.status} ${body}`);
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

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: 'Confirm your email change',
        html: `<p>Click the link below to confirm your email change:</p><p><a href="${link}">${link}</a></p>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => 'unknown error');
      throw new Error(`Resend API error: ${response.status} ${body}`);
    }
  }
}
