import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUserResponse } from '../auth.service';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUserResponse | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthUserResponse }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
