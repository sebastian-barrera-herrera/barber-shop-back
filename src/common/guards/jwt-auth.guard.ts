import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser } from '../auth-user';
import { IS_PUBLIC_KEY } from '../decorators';

/** Guard global: toda ruta requiere JWT salvo las marcadas con @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token)
      throw new UnauthorizedException('Inicia sesión para continuar');

    try {
      req.user = await this.jwt.verifyAsync<AuthUser>(token);
    } catch {
      throw new UnauthorizedException('Tu sesión expiró. Vuelve a iniciar sesión');
    }
    return true;
  }
}
