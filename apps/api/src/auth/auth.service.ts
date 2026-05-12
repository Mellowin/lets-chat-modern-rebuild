import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, User } from '@lets-chat/database';
import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { JwtPayload } from './jwt-payload.type';

type SafeUser = Omit<User, 'passwordHash'>;

interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly password: PasswordService,
    private readonly token: TokenService,
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

    const safeUser = this.toSafeUser(user);
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.token.signAccessToken(payload),
      this.token.signRefreshToken(payload),
    ]);

    return { user: safeUser, accessToken, refreshToken };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.validateUserCredentials(input.email, input.password);
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const [accessToken, refreshToken] = await Promise.all([
      this.token.signAccessToken(payload),
      this.token.signRefreshToken(payload),
    ]);

    return { user, accessToken, refreshToken };
  }

  private async validateUserCredentials(
    email: string,
    password: string,
  ): Promise<SafeUser> {
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await this.password.verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.toSafeUser(user);
  }

  private toSafeUser(user: User): SafeUser {
    const { passwordHash: _pw, ...safe } = user;
    return safe;
  }
}
