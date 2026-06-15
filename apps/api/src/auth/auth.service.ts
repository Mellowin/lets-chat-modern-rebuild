import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@lets-chat/database';
import { createHash, randomBytes, randomUUID } from 'crypto';
import ms from 'ms';
import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RefreshTokensRepository } from './refresh-tokens.repository';
import { JwtPayload } from './jwt-payload.type';
import { MailService } from '../mail/mail.service';

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

export interface RegisterPendingResult {
  requiresEmailVerification: true;
  email: string;
}

export interface SessionResponse {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  isActive: boolean;
  isCurrent: boolean;
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly password: PasswordService,
    private readonly token: TokenService,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(input: RegisterInput): Promise<RegisterPendingResult> {
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

    const rawToken = this.generateVerificationToken();
    const tokenHash = this.hashVerificationToken(rawToken);
    const expiresAt = this.getVerificationExpiryDate();

    await this.users.updateEmailVerificationToken(
      user.id,
      tokenHash,
      expiresAt,
      new Date(),
    );

    await this.mail.sendVerificationEmail({
      to: user.email,
      token: rawToken,
    });

    return { requiresEmailVerification: true, email: user.email };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.validateUserCredentials(
      input.email,
      input.password,
    );

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email not verified');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      jti: randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.token.signAccessToken(payload),
      this.token.signRefreshToken(payload),
    ]);

    await this.persistRefreshToken(user.id, refreshToken, payload.jti);

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

    await this.persistRefreshToken(user.id, newRefreshToken, newPayload.jti);

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

  async verifyEmail(token: string): Promise<{ success: boolean }> {
    const tokenHash = this.hashVerificationToken(token);
    const user = await this.users.findByEmailVerificationTokenHash(tokenHash);

    if (!user) {
      throw new NotFoundException('Invalid or expired verification token');
    }

    if (
      user.emailVerificationExpiresAt &&
      user.emailVerificationExpiresAt < new Date()
    ) {
      throw new NotFoundException('Invalid or expired verification token');
    }

    await this.users.markEmailVerified(user.id);
    return { success: true };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const genericMessage =
      'If the email exists and is not verified, a verification email has been sent.';

    const user = await this.users.findByEmail(email);
    if (!user) {
      return { message: genericMessage };
    }

    if (user.emailVerifiedAt) {
      return { message: genericMessage };
    }

    const cooldownMs = 60_000;
    if (
      user.emailVerificationSentAt &&
      Date.now() - user.emailVerificationSentAt.getTime() < cooldownMs
    ) {
      return { message: genericMessage };
    }

    const rawToken = this.generateVerificationToken();
    const tokenHash = this.hashVerificationToken(rawToken);
    const expiresAt = this.getVerificationExpiryDate();

    await this.users.updateEmailVerificationToken(
      user.id,
      tokenHash,
      expiresAt,
      new Date(),
    );

    await this.mail.sendVerificationEmail({
      to: user.email,
      token: rawToken,
    });

    return { message: genericMessage };
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

  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericMessage = 'If the email exists, a reset link has been sent.';

    const user = await this.users.findByEmail(email);
    if (!user) {
      return { message: genericMessage };
    }

    const rawToken = this.generateResetToken();
    const tokenHash = this.hashResetToken(rawToken);
    const expiresAt = this.getPasswordResetExpiryDate();

    await this.users.updatePasswordResetToken(
      user.id,
      tokenHash,
      expiresAt,
      new Date(),
    );

    await this.mail.sendPasswordResetEmail({
      to: user.email,
      token: rawToken,
    });

    return { message: genericMessage };
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ success: boolean }> {
    const tokenHash = this.hashResetToken(token);
    const user = await this.users.findByPasswordResetTokenHash(tokenHash);

    if (!user) {
      throw new NotFoundException('Invalid or expired reset token');
    }

    if (
      user.passwordResetExpiresAt &&
      user.passwordResetExpiresAt < new Date()
    ) {
      throw new NotFoundException('Invalid or expired reset token');
    }

    const isSamePassword = await this.password.verifyPassword(
      password,
      user.passwordHash,
    );
    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const passwordHash = await this.password.hashPassword(password);
    await this.users.updatePassword(user.id, passwordHash);
    await this.users.clearPasswordResetToken(user.id);
    await this.refreshTokens.revokeAllForUser(user.id);

    return { success: true };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const currentValid = await this.password.verifyPassword(
      currentPassword,
      user.passwordHash,
    );
    if (!currentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const isSamePassword = await this.password.verifyPassword(
      newPassword,
      user.passwordHash,
    );
    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const passwordHash = await this.password.hashPassword(newPassword);
    await this.users.updatePassword(user.id, passwordHash);
    await this.refreshTokens.revokeAllForUser(user.id);

    return { success: true };
  }

  async requestEmailChange(
    userId: string,
    newEmail: string,
  ): Promise<{ message: string }> {
    const normalizedEmail = newEmail.trim().toLowerCase();

    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (normalizedEmail === user.email.toLowerCase()) {
      throw new BadRequestException(
        'New email must be different from current email',
      );
    }

    const existingUser = await this.users.findByEmail(normalizedEmail);
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('Email already in use');
    }

    const rawToken = this.generateResetToken();
    const tokenHash = this.hashResetToken(rawToken);
    const expiresAt = this.getEmailChangeExpiryDate();

    await this.users.updateEmailChangeToken(
      userId,
      normalizedEmail,
      tokenHash,
      expiresAt,
      new Date(),
    );

    await this.mail.sendEmailChangeConfirmationEmail({
      to: normalizedEmail,
      token: rawToken,
    });

    return { message: 'Check your new email to confirm the change.' };
  }

  async confirmEmailChange(token: string): Promise<{ success: boolean }> {
    const tokenHash = this.hashResetToken(token);
    const user = await this.users.findByEmailChangeTokenHash(tokenHash);

    if (!user) {
      throw new NotFoundException('Invalid or expired email change token');
    }

    if (user.emailChangeExpiresAt && user.emailChangeExpiresAt < new Date()) {
      throw new NotFoundException('Invalid or expired email change token');
    }

    if (!user.pendingEmail) {
      throw new NotFoundException('Invalid or expired email change token');
    }

    const existingUser = await this.users.findByEmail(user.pendingEmail);
    if (existingUser && existingUser.id !== user.id) {
      throw new ConflictException('Email already in use');
    }

    await this.users.updateEmail(user.id, user.pendingEmail);
    await this.users.clearEmailChangeToken(user.id);

    return { success: true };
  }

  async listSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionResponse[]> {
    const sessions = await this.refreshTokens.listSessionsForUser(userId);
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      isActive: session.revokedAt === null && session.expiresAt > new Date(),
      isCurrent: currentSessionId === session.id,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? null,
    }));
  }

  async revokeAllSessions(
    userId: string,
  ): Promise<{ success: boolean; revokedCount: number }> {
    const revokedCount = await this.refreshTokens.revokeAllForUser(userId);
    return { success: true, revokedCount };
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<{ success: boolean; revokedCount: number }> {
    const revokedCount = await this.refreshTokens.revokeAllForUserExcept(
      userId,
      currentSessionId,
    );
    return { success: true, revokedCount };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<{ success: boolean }> {
    const revokedCount = await this.refreshTokens.revokeByIdForUser(
      sessionId,
      userId,
    );
    if (revokedCount === 0) {
      throw new NotFoundException('Session not found');
    }
    return { success: true };
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

  private generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashVerificationToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getVerificationExpiryDate(): Date {
    // 24 hours
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  private generateResetToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getPasswordResetExpiryDate(): Date {
    // 60 minutes
    return new Date(Date.now() + 60 * 60 * 1000);
  }

  private getEmailChangeExpiryDate(): Date {
    // 24 hours
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  private async persistRefreshToken(
    userId: string,
    token: string,
    sessionId: string,
  ): Promise<void> {
    const tokenHash = this.hashRefreshToken(token);
    const expiresAt = this.getRefreshExpiryDate();
    await this.refreshTokens.createToken({
      id: sessionId,
      userId,
      tokenHash,
      expiresAt,
    });
  }
}
