import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from './auth-user';

/** Inyecta el usuario autenticado (puesto por AuthGuard) en el handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
    return req.user;
  },
);
