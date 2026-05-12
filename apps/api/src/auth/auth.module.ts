import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [PasswordService, TokenService, AuthService],
  exports: [PasswordService, TokenService, AuthService],
})
export class AuthModule {}
