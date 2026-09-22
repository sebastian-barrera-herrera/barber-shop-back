import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionPlan, type Business } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WompiProvider } from '../payments/providers/wompi.provider';
import type { ProviderCredentials } from '../payments/providers/payment-provider';

const DAY = 86_400_000;

/** Días que faltan (0 si ya pasó) para una fecha. */
const daysUntil = (date: Date | null) =>
  date ? Math.max(0, Math.ceil((date.getTime() - Date.now()) / DAY)) : 0;

function addPeriod(from: Date, plan: SubscriptionPlan): Date {
  const d = new Date(from);
  if (plan === 'YEARLY') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/**
 * La suscripción del negocio con la plataforma: 14 días de prueba y luego el plan mensual o anual.
 * Cobra con la cuenta de Wompi de la plataforma, no con la del negocio.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly wompi: WompiProvider,
  ) {}

  private get prices() {
    return {
      MONTHLY: this.config.get('PLAN_MONTHLY_CENTS'),
      YEARLY: this.config.get('PLAN_YEARLY_CENTS'),
    };
  }

  private credentials(): ProviderCredentials | null {
    const publicKey = this.config.get('PLATFORM_WOMPI_PUBLIC_KEY');
    const integritySecret = this.config.get('PLATFORM_WOMPI_INTEGRITY_SECRET');
    if (!publicKey || !integritySecret) return null;
    return {
      environment:
        this.config.get('PLATFORM_WOMPI_ENVIRONMENT') === 'production' ? 'PRODUCTION' : 'SANDBOX',
      publicKey,
      secrets: {
        integritySecret,
        privateKey: this.config.get('PLATFORM_WOMPI_PRIVATE_KEY'),
      },
    };
  }

  /** Estado que ve el negocio en Configuración → Suscripción. */
  async get(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        trialEndsAt: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        currentPeriodEnd: true,
      },
    });
    const payments = await this.prisma.subscriptionPayment.findMany({
      where: { businessId, status: 'PAID' },
      orderBy: { paidAt: 'desc' },
      take: 12,
      select: { id: true, plan: true, amountCents: true, currency: true, paidAt: true },
    });

    const trialing = business.subscriptionStatus === 'TRIALING';
    return {
      ...business,
      daysLeft: daysUntil(trialing ? business.trialEndsAt : business.currentPeriodEnd),
      prices: this.prices,
      /** Sin llaves de la plataforma no se puede cobrar en línea todavía. */
      canPayOnline: this.credentials() !== null,
      payments,
    };
  }

  /** Arranca un pago de la suscripción y devuelve el enlace de la pasarela. */
  async checkout(businessId: string, plan: SubscriptionPlan, email: string | null) {
    const creds = this.credentials();
    if (!creds) {
      throw new BadRequestException(
        'Todavía no podemos cobrar en línea. Escríbenos y activamos tu plan',
      );
    }
    const amountCents = this.prices[plan];
    const reference = `sub_${businessId.slice(0, 8)}_${randomBytes(8).toString('hex')}`;
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { name: true, phone: true, email: true },
    });

    await this.prisma.subscriptionPayment.create({
      data: { businessId, plan, amountCents, providerReference: reference },
    });

    const web = this.config.get('WEB_URL');
    return this.wompi.createCheckout(creds, {
      reference,
      amountCents,
      currency: 'COP',
      redirectUrl: `${web}/admin/configuracion?suscripcion=1`,
      customer: {
        fullName: business.name,
        phone: business.phone ?? '',
        email: email ?? business.email,
      },
    });
  }

  /**
   * Al volver de la pasarela: confirma con Wompi y, si está aprobado, extiende el período.
   * Se puede llamar varias veces; solo cuenta una.
   */
  async verify(businessId: string, transactionId: string) {
    const creds = this.credentials();
    if (!creds) throw new BadRequestException('Los pagos de la suscripción no están configurados');
    const tx = await this.wompi.getTransaction(creds, transactionId);

    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { providerReference: tx.reference },
    });
    if (!payment || payment.businessId !== businessId) {
      throw new NotFoundException('No encontramos ese pago');
    }
    if (payment.status === 'PAID') return this.get(businessId);
    if (tx.status !== 'PAID') {
      await this.prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { status: tx.status, transactionId },
      });
      return this.get(businessId);
    }

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { currentPeriodEnd: true },
    });
    // Si renueva antes de vencer, el tiempo que le queda se respeta.
    const from =
      business.currentPeriodEnd && business.currentPeriodEnd > new Date()
        ? business.currentPeriodEnd
        : new Date();

    await this.prisma.$transaction([
      this.prisma.subscriptionPayment.update({
        where: { id: payment.id },
        data: { status: 'PAID', transactionId, paidAt: new Date() },
      }),
      this.prisma.business.update({
        where: { id: businessId },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionPlan: payment.plan,
          currentPeriodEnd: addPeriod(from, payment.plan),
        },
      }),
    ]);
    this.logger.log(`Suscripción ${payment.plan} pagada por el negocio ${businessId}`);
    return this.get(businessId);
  }

  /** ¿Puede seguir usando el panel? La página pública nunca se apaga. */
  static isBlocked(
    b: Pick<Business, 'subscriptionStatus' | 'trialEndsAt' | 'currentPeriodEnd'>,
  ): boolean {
    const now = new Date();
    if (b.subscriptionStatus === 'ACTIVE') return !!b.currentPeriodEnd && b.currentPeriodEnd < now;
    if (b.subscriptionStatus === 'TRIALING') return !!b.trialEndsAt && b.trialEndsAt < now;
    return true; // PAST_DUE o CANCELLED
  }

  /** Cada madrugada marca vencidas las pruebas y los períodos que terminaron. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async markExpired() {
    const now = new Date();
    const { count } = await this.prisma.business.updateMany({
      where: {
        OR: [
          { subscriptionStatus: 'TRIALING', trialEndsAt: { lt: now } },
          { subscriptionStatus: 'ACTIVE', currentPeriodEnd: { lt: now } },
        ],
      },
      data: { subscriptionStatus: 'PAST_DUE' },
    });
    if (count) this.logger.log(`${count} negocio(s) pasaron a pago pendiente`);
  }
}
