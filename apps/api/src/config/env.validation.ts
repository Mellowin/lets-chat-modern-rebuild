import * as Joi from 'joi';

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
});
