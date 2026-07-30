import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, ConsoleLogger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { uploadsFallbackMiddleware } from './common/uploads-fallback.middleware';

class FilteredLogger extends ConsoleLogger {
  warn(message: unknown, context?: string): void {
    if (context === 'LegacyRouteConverter') return;
    super.warn(message, context);
  }
}

async function bootstrap() {
  const logger = new FilteredLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
  });

  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  if (isProduction) {
    // Trust the first proxy so req.ip reflects X-Forwarded-For.
    app.set('trust proxy', 1);
    // Apply security headers before CORS and business routes.
    app.use(helmet());
  }

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  // Fallback for missing static uploads (e.g. deleted avatars). Express's default
  // 404 response is JSON, which triggers CORB when loaded via <img>. Mount a tiny
  // transparent PNG fallback that returns HTTP 200 with Content-Type: image/png.
  app.use('/uploads', uploadsFallbackMiddleware);

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigin = configService.get<string>('CORS_ORIGIN');

  if (isProduction && (!corsOrigin || !corsOrigin.trim())) {
    throw new Error(
      'CORS_ORIGIN is required in production and must contain valid origin(s).',
    );
  }

  const developmentOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'https://lets-chat-web.vercel.app',
  ];
  const productionOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];

  const allowedOrigins = corsOrigin
    ? corsOrigin.split(',').map((o) => o.trim())
    : isProduction
      ? productionOrigins
      : developmentOrigins;

  // Private Network Access support: a public HTTPS frontend (e.g. Vercel)
  // is allowed by Chrome to fetch a local API on localhost/127.0.0.1 only if
  // the server responds to the PNA preflight with
  // Access-Control-Allow-Private-Network: true.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestPrivateNetwork =
      req.headers['access-control-request-private-network'];
    if (req.method === 'OPTIONS' && requestPrivateNetwork === 'true') {
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        );
        const requestedHeaders = req.headers['access-control-request-headers'];
        if (requestedHeaders) {
          res.setHeader('Access-Control-Allow-Headers', requestedHeaders);
        }
        res.status(204).end();
        return;
      }
    }
    next();
  });

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.enableShutdownHooks();

  // Ensure SIGTERM/SIGINT result in a clean exit code 0 after NestJS closes
  // the application and runs all shutdown hooks. Without an explicit exit(0),
  // Node's default signal handler would terminate with code 128 + signal.
  const shutdown = async (signal: string) => {
    logger.log(`${signal} received, shutting down gracefully`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Swagger/OpenAPI docs are useful in development but increase attack surface
  // in production by enumerating every endpoint. Keep them disabled in prod.
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Lets Chat API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);
}

export { bootstrap };
void bootstrap();
