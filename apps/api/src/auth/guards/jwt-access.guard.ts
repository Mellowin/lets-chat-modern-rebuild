import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from '../token.service';
import { UsersRepository } from '../../users/users.repository';
import { AuthUserResponse } from '../auth.service';

@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private readonly token: TokenService,
    private readonly users: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Access token missing');
    }

    let payload;
    try {
      payload = await this.token.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    (request as Request & { user: AuthUserResponse; sessionId?: string }).user =
      this.toAuthUserResponse(user);
    (request as Request & { sessionId?: string }).sessionId = payload.jti;

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private toAuthUserResponse(user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    avatarUpdatedAt: Date | null;
    interfaceLanguage: string;
    createdAt: Date;
    pushNotificationsEnabled?: boolean;
    mentionNotificationsEnabled?: boolean;
    directMessageNotificationsEnabled?: boolean;
    groupMessageNotificationsEnabled?: boolean;
    channelMessageNotificationsEnabled?: boolean;
  }): AuthUserResponse {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      avatarUpdatedAt: user.avatarUpdatedAt,
      interfaceLanguage: user.interfaceLanguage as 'en' | 'uk' | 'ru',
      createdAt: user.createdAt,
      pushNotificationsEnabled: user.pushNotificationsEnabled ?? true,
      mentionNotificationsEnabled: user.mentionNotificationsEnabled ?? true,
      directMessageNotificationsEnabled:
        user.directMessageNotificationsEnabled ?? true,
      groupMessageNotificationsEnabled:
        user.groupMessageNotificationsEnabled ?? true,
      channelMessageNotificationsEnabled:
        user.channelMessageNotificationsEnabled ?? true,
    };
  }
}
