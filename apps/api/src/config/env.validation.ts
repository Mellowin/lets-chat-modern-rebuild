import * as Joi from 'joi';

const localhostOriginPrefixes = [
  'http://localhost',
  'https://localhost',
  'http://127.',
  'https://127.',
];

function isLocalhostOrigin(origin: string): boolean {
  return localhostOriginPrefixes.some((prefix) =>
    origin.toLowerCase().startsWith(prefix),
  );
}

function isValidOrigin(origin: string): boolean {
  return (
    origin.toLowerCase().startsWith('http://') ||
    origin.toLowerCase().startsWith('https://')
  );
}

interface EnvVars {
  NODE_ENV: string;
  DATABASE_URL?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  CORS_ORIGIN?: string;
  APP_WEB_URL?: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
  S3_BUCKET?: string;
  REDIS_URL?: string;
  MAIL_PROVIDER: string;
  MAIL_FROM?: string;
  RESEND_API_KEY?: string;
  CORS_ALLOW_LOCALHOST_IN_PRODUCTION: boolean;
  [key: string]: unknown;
}

export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),

  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(14).default(12),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('7d'),

  REDIS_URL: Joi.string().uri().optional(),
  WEBSOCKET_REDIS_URL: Joi.string().uri().optional(),
  PRESENCE_REDIS_URL: Joi.string().uri().optional(),

  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().port().default(3001),

  CORS_ORIGIN: Joi.string().optional(),
  CORS_ALLOW_LOCALHOST_IN_PRODUCTION: Joi.boolean().default(false),

  S3_ENDPOINT: Joi.string().uri().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  S3_BUCKET: Joi.string().required(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),

  VAPID_PUBLIC_KEY: Joi.string().optional(),
  VAPID_PRIVATE_KEY: Joi.string().optional(),
  VAPID_SUBJECT: Joi.string().uri().optional(),

  MAIL_PROVIDER: Joi.string()
    .valid('console', 'resend', 'smtp')
    .default('console'),
  MAIL_FROM: Joi.string().optional(),
  RESEND_API_KEY: Joi.string().optional(),
  APP_WEB_URL: Joi.string().uri().optional(),

  MAIL_FALLBACK_PROVIDER: Joi.string().valid('smtp').optional(),

  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional(),

  DEMO_MODE_ENABLED: Joi.boolean().default(false),
  DEMO_SESSION_TTL_HOURS: Joi.number().integer().min(1).default(24),
  DEMO_RATE_LIMIT_PER_HOUR: Joi.number().integer().min(1).default(10),

  THROTTLER_TTL_MS: Joi.number().integer().min(1).default(60000),
  THROTTLER_LIMIT: Joi.number().integer().min(1).default(100),
  THROTTLER_ENABLED: Joi.boolean().default(true),
})
  .custom((value: EnvVars, helpers) => {
    if (value.NODE_ENV !== 'production') {
      return value;
    }

    const errors: string[] = [];

    const requiredKeys = [
      'DATABASE_URL',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'CORS_ORIGIN',
      'APP_WEB_URL',
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'S3_BUCKET',
      'REDIS_URL',
    ];

    for (const key of requiredKeys) {
      if (
        value[key] === undefined ||
        value[key] === null ||
        value[key] === ''
      ) {
        errors.push(`${key} is required in production`);
      }
    }

    if (!['resend', 'smtp'].includes(value.MAIL_PROVIDER)) {
      errors.push('MAIL_PROVIDER must be "resend" or "smtp" in production');
    }

    if (value.MAIL_PROVIDER === 'resend') {
      if (!value.MAIL_FROM) {
        errors.push('MAIL_FROM is required when MAIL_PROVIDER is resend');
      }
      if (!value.RESEND_API_KEY) {
        errors.push('RESEND_API_KEY is required when MAIL_PROVIDER is resend');
      }
    }

    if (value.APP_WEB_URL && !value.APP_WEB_URL.startsWith('https://')) {
      errors.push('APP_WEB_URL must start with https:// in production');
    }

    if (value.CORS_ORIGIN) {
      const allowLocalhost = value.CORS_ALLOW_LOCALHOST_IN_PRODUCTION === true;
      const origins = value.CORS_ORIGIN.split(',').map((o) => o.trim());

      for (const origin of origins) {
        if (!origin) {
          errors.push('CORS_ORIGIN contains an empty origin');
          continue;
        }
        if (!isValidOrigin(origin)) {
          errors.push(
            'CORS_ORIGIN origins must start with http:// or https://',
          );
          continue;
        }
        if (!allowLocalhost && isLocalhostOrigin(origin)) {
          errors.push(
            'CORS_ORIGIN contains a localhost/127. origin which is not allowed in production',
          );
        }
      }
    }

    if (errors.length > 0) {
      return helpers.error('custom.env', { message: errors.join('; ') });
    }

    return value;
  })
  .messages({
    'custom.env': '{#message}',
  });
