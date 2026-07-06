import { HttpException, HttpStatus } from '@nestjs/common';

export const MAIL_PROVIDER_ERROR_CODES = {
  QUOTA_EXCEEDED: 'MAIL_PROVIDER_QUOTA_EXCEEDED',
  UNAVAILABLE: 'MAIL_PROVIDER_UNAVAILABLE',
} as const;

export type MailProviderErrorCode =
  (typeof MAIL_PROVIDER_ERROR_CODES)[keyof typeof MAIL_PROVIDER_ERROR_CODES];

const SAFE_CLIENT_MESSAGE =
  'Email delivery is temporarily unavailable. Please try again later.';

export class MailProviderException extends HttpException {
  readonly retryable: boolean;

  constructor(
    statusCode: HttpStatus,
    code: MailProviderErrorCode,
    message = SAFE_CLIENT_MESSAGE,
    retryable = false,
  ) {
    super({ statusCode, error: code, message }, statusCode);
    this.retryable = retryable;
  }
}

export function createMailProviderQuotaExceededException(): MailProviderException {
  return new MailProviderException(
    HttpStatus.SERVICE_UNAVAILABLE,
    MAIL_PROVIDER_ERROR_CODES.QUOTA_EXCEEDED,
    SAFE_CLIENT_MESSAGE,
    true,
  );
}

export function createMailProviderUnavailableException(
  retryable = false,
): MailProviderException {
  return new MailProviderException(
    HttpStatus.SERVICE_UNAVAILABLE,
    MAIL_PROVIDER_ERROR_CODES.UNAVAILABLE,
    SAFE_CLIENT_MESSAGE,
    retryable,
  );
}
