import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';
import { AvatarUploadService } from './avatar-upload.service';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { AdminGuard } from './guards/admin.guard';
import { RefreshTokensRepository } from './refresh-tokens.repository';

@Module({
  imports: [JwtModule.register({}), forwardRef(() => UsersModule), MailModule],
  providers: [
    PasswordService,
    TokenService,
    AuthService,
    AvatarUploadService,
    JwtAccessGuard,
    AdminGuard,
    RefreshTokensRepository,
  ],
  exports: [
    PasswordService,
    TokenService,
    AuthService,
    AvatarUploadService,
    JwtAccessGuard,
    AdminGuard,
    RefreshTokensRepository,
  ],
})
export class AuthCommonModule {}
