import * as Joi from 'joi';
import { envValidationSchema } from './env.validation';

interface ValidatedEnv {
  NODE_ENV: string;
  DEMO_MODE_ENABLED: boolean;
  THROTTLER_ENABLED: boolean;
  [key: string]: unknown;
}

describe('envValidationSchema', () => {
  const baseValid = {
    DATABASE_URL: 'postgresql://localhost/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    S3_ENDPOINT: 'http://minio:9000',
    S3_ACCESS_KEY: 'key',
    S3_SECRET_KEY: 'secret',
    S3_BUCKET: 'bucket',
  };

  function validate(env: Record<string, unknown>): {
    error: Joi.ValidationError | undefined;
    value: ValidatedEnv;
  } {
    return envValidationSchema.validate(env, {
      abortEarly: false,
      allowUnknown: true,
    });
  }

  it('passes with defaults in development', () => {
    const { error, value } = validate({
      ...baseValid,
      NODE_ENV: 'development',
    });
    expect(error).toBeUndefined();
    expect(value.NODE_ENV).toBe('development');
    expect(value.DEMO_MODE_ENABLED).toBe(false);
    expect(value.THROTTLER_ENABLED).toBe(true);
  });

  describe('production', () => {
    const prodBase = {
      ...baseValid,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.example.com',
      APP_WEB_URL: 'https://app.example.com',
      REDIS_URL: 'redis://localhost:6379',
      MAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
    };

    it('passes with all required production fields', () => {
      const { error } = validate(prodBase);
      expect(error).toBeUndefined();
    });

    it('requires production fields', () => {
      const { error } = validate({
        ...prodBase,
        REDIS_URL: undefined,
        CORS_ORIGIN: undefined,
        APP_WEB_URL: undefined,
      });
      expect(error).toBeDefined();
      const message = error?.details.map((d) => d.message).join(' ') ?? '';
      expect(message).toContain('REDIS_URL');
      expect(message).toContain('CORS_ORIGIN');
      expect(message).toContain('APP_WEB_URL');
    });

    it('rejects console mail provider in production', () => {
      const { error } = validate({
        ...prodBase,
        MAIL_PROVIDER: 'console',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('MAIL_PROVIDER');
    });

    it('requires MAIL_FROM and RESEND_API_KEY when MAIL_PROVIDER is resend', () => {
      const { error } = validate({
        ...prodBase,
        MAIL_PROVIDER: 'resend',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('MAIL_FROM');
      expect(error?.message).toContain('RESEND_API_KEY');
    });

    it('passes resend provider when keys are present', () => {
      const { error } = validate({
        ...prodBase,
        MAIL_PROVIDER: 'resend',
        MAIL_FROM: 'no-reply@example.com',
        RESEND_API_KEY: 're_123',
      });
      expect(error).toBeUndefined();
    });

    it('allows HTTPS origins in CORS_ORIGIN', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'https://app.example.com,https://www.example.com',
      });
      expect(error).toBeUndefined();
    });

    it('rejects non-localhost http origins in CORS_ORIGIN', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'http://app.example.com',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('CORS_ORIGIN');
      expect(error?.message).toContain('http://app.example.com');
    });

    it('rejects origins with paths', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'https://app.example.com/path',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('CORS_ORIGIN');
      expect(error?.message).toContain('path');
    });

    it('rejects origins with userinfo', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'https://user:pass@app.example.com',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('CORS_ORIGIN');
    });

    it('rejects malformed origins in CORS_ORIGIN', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'not a url',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('CORS_ORIGIN');
      expect(error?.message).toContain('malformed');
    });

    it('rejects localhost origins in CORS_ORIGIN', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'https://app.example.com,http://localhost:3000',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('CORS_ORIGIN');
      expect(error?.message).toContain('localhost');
    });

    it('rejects 127.0.0.1 origins in CORS_ORIGIN', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'https://app.example.com,http://127.0.0.1:3000',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('CORS_ORIGIN');
      expect(error?.message).toContain('127.');
    });

    it('allows localhost origins when CORS_ALLOW_LOCALHOST_IN_PRODUCTION is true', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'http://localhost:3000,https://127.0.0.1:3000',
        CORS_ALLOW_LOCALHOST_IN_PRODUCTION: 'true',
      });
      expect(error).toBeUndefined();
    });

    it('rejects non-http origins in CORS_ORIGIN', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'ftp://app.example.com',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('CORS_ORIGIN');
      expect(error?.message).toContain('ftp');
    });

    it('rejects empty origins in CORS_ORIGIN', () => {
      const { error } = validate({
        ...prodBase,
        CORS_ORIGIN: 'https://app.example.com,',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('CORS_ORIGIN');
    });

    it('requires APP_WEB_URL to use https in production', () => {
      const { error } = validate({
        ...prodBase,
        APP_WEB_URL: 'http://app.example.com',
      });
      expect(error).toBeDefined();
      expect(error?.message).toContain('APP_WEB_URL');
    });

    it('defaults DEMO_MODE_ENABLED to false in production', () => {
      const { value } = validate(prodBase);
      expect(value.DEMO_MODE_ENABLED).toBe(false);
    });

    it('does not expose secrets in error messages', () => {
      const secret = 'super-secret-jwt-value-that-is-long';
      const { error } = validate({
        ...prodBase,
        JWT_ACCESS_SECRET: secret,
        JWT_REFRESH_SECRET: secret,
        S3_SECRET_KEY: secret,
        // Make CORS invalid to trigger an error, but secrets are already present.
        CORS_ORIGIN: 'not-an-origin',
      });
      expect(error).toBeDefined();
      expect(error?.message).not.toContain(secret);
      const detailsMessage =
        error?.details.map((d) => d.message).join(' ') ?? '';
      expect(detailsMessage).not.toContain(secret);
    });
  });

  it('keeps JWT secrets minimum 32 characters', () => {
    const { error } = validate({
      ...baseValid,
      JWT_ACCESS_SECRET: 'short',
    });
    expect(error).toBeDefined();
    expect(
      error?.details.some((d) => d.context?.key === 'JWT_ACCESS_SECRET'),
    ).toBe(true);
  });
});
