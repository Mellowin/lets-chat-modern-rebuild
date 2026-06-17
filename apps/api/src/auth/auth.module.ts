import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AvatarUploadService } from './avatar-upload.service';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { JwtAccessQueryGuard } from './guards/jwt-access-query.guard';
import { RefreshTokensRepository } from './refresh-tokens.repository';

@Module({
  imports: [JwtModule.register({}), UsersModule, MailModule],
  controllers: [AuthController],
  providers: [
    PasswordService,
    TokenService,
    AuthService,
    AvatarUploadService,
    JwtAccessGuard,
    JwtAccessQueryGuard,
    RefreshTokensRepository,
  ],
  exports: [
    PasswordService,
    TokenService,
    AuthService,
    AvatarUploadService,
    JwtAccessGuard,
    JwtAccessQueryGuard,
    RefreshTokensRepository,
  ],
})
export class AuthModule {}
