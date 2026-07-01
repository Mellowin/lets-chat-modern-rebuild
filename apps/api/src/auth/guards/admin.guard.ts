import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthUserResponse } from '../auth.service';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthUserResponse }>();
    const user = request.user;

    if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
      throw new ForbiddenException('Forbidden');
    }

    return true;
  }
}
