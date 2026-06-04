import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendVerificationEmailInput {
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
}
