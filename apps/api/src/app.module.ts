import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from '@lets-chat/database';
import { envValidationSchema } from './config/env.validation';
import { RequestIdInterceptor } from './logger/request-id.interceptor';
import { normalizeRequestId } from './logger/request-id.util';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { StorageModule } from './storage/storage.module';
import { WebsocketModule } from './websocket/websocket.module';
import { InvitesModule } from './invites/invites.module';
import { ChannelInvitesModule } from './channel-invites/channel-invites.module';
import { AuditModule } from './audit/audit.module';
import { DirectConversationsModule } from './direct-conversations/direct-conversations.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req) =>
          normalizeRequestId(req.headers['x-request-id']) ||
          crypto.randomUUID(),
        customProps: (req) => ({ requestId: req.id }),
      },
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    HealthModule,
    MailModule,
    WorkspacesModule,
    ChannelsModule,
    MessagesModule,
    StorageModule,
    WebsocketModule,
    InvitesModule,
    ChannelInvitesModule,
    AuditModule,
    DirectConversationsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
