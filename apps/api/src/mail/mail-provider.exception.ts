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
  constructor(
    statusCode: HttpStatus,
    code: MailProviderErrorCode,
    message = SAFE_CLIENT_MESSAGE,
  ) {
    super({ statusCode, error: code, message }, statusCode);
  }
}

export function createMailProviderQuotaExceededException(): MailProviderException {
  return new MailProviderException(
    HttpStatus.SERVICE_UNAVAILABLE,
    MAIL_PROVIDER_ERROR_CODES.QUOTA_EXCEEDED,
  );
}

export function createMailProviderUnavailableException(): MailProviderException {
  return new MailProviderException(
    HttpStatus.SERVICE_UNAVAILABLE,
    MAIL_PROVIDER_ERROR_CODES.UNAVAILABLE,
  );
}
