import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import type { AuthUser } from '../auth-user';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!roles?.length) return true;

    const user = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('No tienes permiso para hacer esto');
    }
    return true;
  }
}
