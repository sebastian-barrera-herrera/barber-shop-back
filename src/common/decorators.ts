import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'isPublic';
/** Ruta accesible sin autenticación. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restringe la ruta a los roles indicados. Sin @Roles, cualquier usuario autenticado accede. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Inyecta el usuario autenticado. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return req.user;
});

/** Inyecta el id del negocio del usuario autenticado (tenant). */
export const BusinessId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return req.user.bid;
});
