import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from '../../common/auth-user';
import { IS_PUBLIC_KEY } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';

const CACHE_MS = 60_000;
/** Lo único que un negocio con el pago vencido puede escribir: su propia suscripción. */
const ALLOWED = ['/subscription', '/auth'];

/**
 * Con la prueba vencida o el pago al día pendiente, el panel queda de solo lectura:
 * se sigue viendo la agenda, pero no se crean ni se cambian datos.
 * La página pública y las reservas de los clientes nunca se detienen.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly cache = new Map<string, { blocked: boolean; at: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user || req.method === 'GET' || req.method === 'HEAD') return true;
    if (ALLOWED.some((p) => req.path.includes(p))) return true;

    if (await this.blocked(req.user.bid)) {
      throw new ForbiddenException(
        'Tu prueba terminó. Activa tu plan en Configuración → Suscripción para seguir usando el panel',
      );
    }
    return true;
  }

  private async blocked(businessId: string): Promise<boolean> {
    const hit = this.cache.get(businessId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.blocked;
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true },
    });
    const blocked = business ? SubscriptionService.isBlocked(business) : false;
    this.cache.set(businessId, { blocked, at: Date.now() });
    return blocked;
  }
}
