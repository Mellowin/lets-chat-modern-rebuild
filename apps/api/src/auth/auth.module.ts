import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { RefreshTokensRepository } from './refresh-tokens.repository';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [
    PasswordService,
    TokenService,
    AuthService,
    JwtAccessGuard,
    RefreshTokensRepository,
  ],
  exports: [
    PasswordService,
    TokenService,
    AuthService,
    JwtAccessGuard,
    RefreshTokensRepository,
  ],
})
export class AuthModule {}
