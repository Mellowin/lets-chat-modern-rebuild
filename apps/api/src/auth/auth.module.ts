import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.register({}), UsersModule],
  providers: [PasswordService, TokenService, AuthService],
  exports: [PasswordService, TokenService, AuthService],
})
export class AuthModule {}
