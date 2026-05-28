import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@lets-chat/database';
import { createHash, randomUUID } from 'crypto';
import ms from 'ms';
import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { JwtPayload } from './jwt-payload.type';

type SafeUser = Omit<User, 'passwordHash'>;

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthUserResponse {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarUpdatedAt: Date | null;
  interfaceLanguage: 'en' | 'uk' | 'ru';
  createdAt: Date;
}

export interface AuthResult {
  user: AuthUserResponse;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly password: PasswordService,
    private readonly token: TokenService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existingEmail = await this.users.findByEmail(input.email);
    if (existingEmail) {
      throw new ConflictException('Email already in use');
    }

    const existingUsername = await this.users.findByUsername(input.username);
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    const passwordHash = await this.password.hashPassword(input.password);

    let user: User;
    try {
      user = await this.users.createUser({
        email: input.email,
        username: input.username,
        passwordHash,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email or username already in use');
      }
      throw error;
    }

    const authUser = this.toAuthUserResponse(user);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.token.signAccessToken(payload),
      this.token.signRefreshToken(payload),
    ]);

    await this.persistRefreshToken(user.id, refreshToken);

    return { user: authUser, accessToken, refreshToken };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.validateUserCredentials(
      input.email,
      input.password,
    );
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.token.signAccessToken(payload),
      this.token.signRefreshToken(payload),
    ]);

    await this.persistRefreshToken(user.id, refreshToken);

    const authUser = this.toAuthUserResponse(user);
    return { user: authUser, accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: JwtPayload;
    try {
      payload = await this.token.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    const consumed = await this.refreshTokens.consumeActiveToken(tokenHash);
    if (consumed !== 1) {
      throw new UnauthorizedException('Refresh token not found or revoked');
    }

    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const newPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
    };
    const [accessToken, newRefreshToken] = await Promise.all([
      this.token.signAccessToken(newPayload),
      this.token.signRefreshToken(newPayload),
    ]);

    await this.persistRefreshToken(user.id, newRefreshToken);

    const authUser = this.toAuthUserResponse(user);
    return { user: authUser, accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    try {
      await this.refreshTokens.revokeToken(tokenHash);
    } catch {
      // ignore errors for already revoked or missing tokens
    }
    return { success: true };
  }

  private async validateUserCredentials(
    email: string,
    password: string,
  ): Promise<SafeUser> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await this.password.verifyPassword(
      password,
      user.passwordHash,
    );
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.toSafeUser(user);
  }

  private toSafeUser(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _pw, ...safe } = user;
    return safe;
  }

  async updateMe(
    userId: string,
    displayName: string | null,
  ): Promise<AuthUserResponse> {
    const user = await this.users.updateDisplayName(userId, displayName);
    return this.toAuthUserResponse(user);
  }

  async updateAvatar(
    userId: string,
    avatarUrl: string,
  ): Promise<AuthUserResponse> {
    const user = await this.users.updateAvatar(userId, avatarUrl);
    return this.toAuthUserResponse(user);
  }

  async updateInterfaceLanguage(
    userId: string,
    interfaceLanguage: 'en' | 'uk' | 'ru',
  ): Promise<AuthUserResponse> {
    const user = await this.users.updateInterfaceLanguage(
      userId,
      interfaceLanguage,
    );
    return this.toAuthUserResponse(user);
  }

  private toAuthUserResponse(user: User | SafeUser): AuthUserResponse {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName ?? null,
      avatarUrl: user.avatarUrl ?? null,
      avatarUpdatedAt: user.avatarUpdatedAt ?? null,
      interfaceLanguage: ((user as User).interfaceLanguage ?? 'en') as
        | 'en'
        | 'uk'
        | 'ru',
      createdAt: user.createdAt,
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getRefreshExpiryDate(): Date {
    const expiresIn = this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN');
    const msValue = ms(expiresIn as ms.StringValue);
    if (typeof msValue !== 'number') {
      throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN: ${expiresIn}`);
    }
    return new Date(Date.now() + msValue);
  }

  private async persistRefreshToken(
    userId: string,
    token: string,
  ): Promise<void> {
    const tokenHash = this.hashRefreshToken(token);
    const expiresAt = this.getRefreshExpiryDate();
    await this.refreshTokens.createToken({ userId, tokenHash, expiresAt });
  }
}
