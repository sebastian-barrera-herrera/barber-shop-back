import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Payment, Prisma, TransactionStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type { AuthUser } from '../../common/auth-user';
import { EVENTS, type PaymentEvent } from '../../common/events';
import { Page, PageQuery, paging } from '../../common/pagination';
import { decrypt, encrypt, sha256Hex } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessService } from '../business/business.service';
import {
  PAYMENT_PROVIDERS,
  type PaymentProvider,
  type ProviderCredentials,
  type ProviderTransaction,
} from './providers/payment-provider';

export interface SaveProviderConfig {
  environment: 'SANDBOX' | 'PRODUCTION';
  publicKey: string;
  isEnabled: boolean;
  /** Secretos: si no vienen, se conservan los guardados */
  secrets: Record<string, string | undefined>;
}

const DEFAULT_PROVIDER = 'wompi';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly business: BusinessService,
    private readonly events: EventEmitter2,
    @Inject(PAYMENT_PROVIDERS) private readonly providers: PaymentProvider[],
  ) {}

  // ───────────── Configuración ─────────────

  /** Estado de la configuración para el panel. Nunca devuelve secretos. */
  async getConfig(businessId: string, providerId = DEFAULT_PROVIDER) {
    const provider = this.provider(providerId);
    const row = await this.prisma.paymentProviderConfig.findUnique({
      where: { businessId_provider: { businessId, provider: providerId } },
    });
    const secrets = row?.encryptedSecrets ? this.readSecrets(row.encryptedSecrets) : {};
    return {
      provider: providerId,
      environment: row?.environment ?? 'SANDBOX',
      publicKey: row?.publicKey ?? '',
      isEnabled: row?.isEnabled ?? false,
      configuredSecrets: Object.fromEntries(provider.requiredSecrets.map((k) => [k, !!secrets[k]])),
      usingEnvFallback: !row && this.envCredentials() !== null,
      webhookUrl: `${this.config.get('API_PUBLIC_URL')}/api/v1/payments/webhooks/${providerId}`,
    };
  }

  async saveConfig(businessId: string, input: SaveProviderConfig, providerId = DEFAULT_PROVIDER) {
    const provider = this.provider(providerId);
    const existing = await this.prisma.paymentProviderConfig.findUnique({
      where: { businessId_provider: { businessId, provider: providerId } },
    });
    const merged = {
      ...(existing?.encryptedSecrets ? this.readSecrets(existing.encryptedSecrets) : {}),
    };
    for (const k of provider.requiredSecrets) {
      const v = input.secrets[k]?.trim();
      if (v) merged[k] = v;
    }
    if (input.isEnabled) {
      const missing = provider.requiredSecrets.filter((k) => !merged[k]);
      if (!input.publicKey.trim() || missing.length) {
        throw new BadRequestException(
          'Para activar los pagos completa la llave pública y todos los secretos',
        );
      }
      const prefix = input.environment === 'SANDBOX' ? 'pub_test_' : 'pub_prod_';
      if (providerId === 'wompi' && !input.publicKey.startsWith(prefix)) {
        throw new BadRequestException(
          `La llave pública de ${input.environment === 'SANDBOX' ? 'pruebas' : 'producción'} empieza por ${prefix}`,
        );
      }
    }
    let encryptedSecrets: string;
    try {
      encryptedSecrets = encrypt(JSON.stringify(merged), this.config.get('ENCRYPTION_KEY'));
    } catch (e) {
      throw new InternalServerErrorException(
        `No se pudieron guardar las llaves: ${(e as Error).message}`,
      );
    }
    const data = {
      environment: input.environment,
      publicKey: input.publicKey.trim(),
      isEnabled: input.isEnabled,
      encryptedSecrets,
    };
    await this.prisma.paymentProviderConfig.upsert({
      where: { businessId_provider: { businessId, provider: providerId } },
      create: { businessId, provider: providerId, ...data },
      update: data,
    });
    return this.getConfig(businessId, providerId);
  }

  /** ¿Puede este negocio cobrar en línea? (para la web pública) */
  async onlinePaymentsEnabled(businessId: string): Promise<boolean> {
    return (await this.credentials(businessId)) !== null;
  }

  // ───────────── Cliente ─────────────

  /** Inicia el pago de una cita desde su enlace privado. Devuelve la URL de la pasarela. */
  async startCheckout(businessId: string, token: string) {
    const appt = await this.appointmentByToken(businessId, token);
    if (appt.paymentStatus === 'PAID') throw new BadRequestException('Esta cita ya está pagada');
    if (!['PENDING', 'CONFIRMED'].includes(appt.status))
      throw new BadRequestException('Esta cita ya no se puede pagar');

    const creds = await this.credentials(businessId);
    if (!creds) throw new BadRequestException('Este negocio no recibe pagos en línea');
    const provider = this.provider(creds.providerId);
    const reference = `SB-${appt.id.slice(0, 8)}-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;

    await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          businessId,
          appointmentId: appt.id,
          provider: creds.providerId,
          providerReference: reference,
          amountCents: appt.priceCents,
          currency: appt.business.currency,
          status: 'PENDING',
        },
      }),
      this.prisma.appointment.update({
        where: { id: appt.id },
        data: { paymentStatus: 'PENDING' },
      }),
    ]);

    return provider.createCheckout(creds, {
      reference,
      amountCents: appt.priceCents,
      currency: appt.business.currency,
      redirectUrl: `${this.config.get('WEB_URL')}/cita/${encodeURIComponent(token)}?pago=1`,
      customer: {
        fullName: appt.customer.name,
        phone: appt.customer.phone,
        email: appt.customer.email,
      },
    });
  }

  /** Al volver de la pasarela: consulta el estado real (no se confía en la URL). */
  async verifyReturn(businessId: string, token: string, transactionId: string) {
    const appt = await this.appointmentByToken(businessId, token);
    const creds = await this.credentials(businessId);
    if (!creds) throw new BadRequestException('Este negocio no recibe pagos en línea');
    const tx = await this.provider(creds.providerId).getTransaction(creds, transactionId);
    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: tx.reference },
    });
    if (!payment || payment.appointmentId !== appt.id)
      throw new NotFoundException('Ese pago no corresponde a esta cita');
    const updated = await this.apply(payment, tx);
    return { status: updated.status };
  }

  /** Webhook de la pasarela: la firma se verifica con los secretos del negocio dueño del pago. */
  async handleWebhook(providerId: string, body: unknown) {
    const provider = this.provider(providerId);
    const reference = provider.referenceFromWebhook(body);
    if (!reference) throw new BadRequestException('Evento sin referencia');
    const payment = await this.prisma.payment.findUnique({
      where: { providerReference: reference },
    });
    if (!payment) {
      this.logger.warn(`Webhook con referencia desconocida: ${reference}`);
      return { received: true };
    }
    const creds = await this.credentials(payment.businessId);
    if (!creds) throw new BadRequestException('Pagos no configurados');
    const tx = provider.parseWebhook(creds, body);
    await this.apply(payment, tx);
    return { received: true };
  }

  // ───────────── Panel ─────────────

  async list(
    user: AuthUser,
    q: PageQuery & { status?: TransactionStatus },
  ): Promise<Page<unknown>> {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.PaymentWhereInput = {
      businessId: user.bid,
      ...(q.status ? { status: q.status } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        omit: { rawPayload: true },
        include: {
          appointment: {
            select: {
              id: true,
              startsAt: true,
              serviceNameSnapshot: true,
              customer: { select: { name: true, phone: true } },
            },
          },
        },
      }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Reembolso hecho en el panel de la pasarela: se registra aquí para que las cuentas cuadren. */
  async markRefunded(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findFirst({ where: { id, businessId: user.bid } });
    if (!payment) throw new NotFoundException('No encontramos ese pago');
    if (payment.status !== 'PAID')
      throw new BadRequestException('Solo se puede reembolsar un pago aprobado');
    await this.prisma.$transaction([
      this.prisma.payment.update({ where: { id }, data: { status: 'REFUNDED' } }),
      this.prisma.appointment.update({
        where: { id: payment.appointmentId },
        data: { paymentStatus: 'REFUNDED' },
      }),
    ]);
  }

  // ───────────── núcleo ─────────────

  /**
   * Aplica el estado de la pasarela. Idempotente: el mismo evento dos veces no cambia nada.
   * Un monto distinto al esperado se rechaza (protege contra manipulación del checkout).
   */
  private async apply(payment: Payment, tx: ProviderTransaction): Promise<Payment> {
    let status = tx.status;
    if (
      status === 'PAID' &&
      (tx.amountCents !== payment.amountCents || tx.currency !== payment.currency)
    ) {
      this.logger.error(
        `Monto no coincide en ${payment.providerReference}: ${tx.amountCents} vs ${payment.amountCents}`,
      );
      status = 'FAILED';
    }
    if (payment.status === status && payment.providerTransactionId === tx.transactionId)
      return payment;
    if (payment.status === 'PAID' || payment.status === 'REFUNDED') return payment; // estados finales

    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: payment.appointmentId },
      include: { customer: { select: { name: true } } },
    });
    const { settings } = await this.business.getSchedulingContext(payment.businessId);

    const [updated] = await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status,
          providerTransactionId: tx.transactionId,
          rawPayload: tx.raw as Prisma.InputJsonValue,
        },
      }),
      this.prisma.appointment.update({
        where: { id: appt.id },
        data: {
          ...(status === 'PAID' ? { paymentStatus: 'PAID', paymentMethod: 'ONLINE' } : {}),
          ...(status === 'FAILED' && appt.paymentStatus !== 'PAID'
            ? { paymentStatus: 'FAILED' }
            : {}),
          // Si el pago era obligatorio, pagar confirma la cita.
          ...(status === 'PAID' &&
          appt.status === 'PENDING' &&
          settings.booking.paymentMode === 'REQUIRED'
            ? { status: 'CONFIRMED' }
            : {}),
        },
      }),
    ]);

    this.events.emit(EVENTS.paymentUpdated, {
      businessId: payment.businessId,
      appointmentId: appt.id,
      customerName: appt.customer.name,
      status,
      amountCents: payment.amountCents,
    } satisfies PaymentEvent);
    return updated;
  }

  private async credentials(
    businessId: string,
  ): Promise<(ProviderCredentials & { providerId: string }) | null> {
    const row = await this.prisma.paymentProviderConfig.findFirst({
      where: { businessId, isEnabled: true },
    });
    if (row?.encryptedSecrets && row.publicKey) {
      return {
        providerId: row.provider,
        environment: row.environment,
        publicKey: row.publicKey,
        secrets: this.readSecrets(row.encryptedSecrets),
      };
    }
    // Sin configuración propia: variables de entorno (instalación de un solo negocio).
    const hasOwnRow = await this.prisma.paymentProviderConfig.count({ where: { businessId } });
    return hasOwnRow ? null : this.envCredentials();
  }

  private envCredentials(): (ProviderCredentials & { providerId: string }) | null {
    const publicKey = this.config.get('WOMPI_PUBLIC_KEY');
    const integritySecret = this.config.get('WOMPI_INTEGRITY_SECRET');
    if (!publicKey || !integritySecret) return null;
    return {
      providerId: 'wompi',
      environment: this.config.get('WOMPI_ENVIRONMENT') === 'production' ? 'PRODUCTION' : 'SANDBOX',
      publicKey,
      secrets: {
        integritySecret,
        eventsSecret: this.config.get('WOMPI_EVENTS_SECRET'),
        privateKey: this.config.get('WOMPI_PRIVATE_KEY'),
      },
    };
  }

  private readSecrets(payload: string): Record<string, string> {
    return JSON.parse(decrypt(payload, this.config.get('ENCRYPTION_KEY'))) as Record<
      string,
      string
    >;
  }

  private provider(id: string): PaymentProvider {
    const p = this.providers.find((x) => x.id === id);
    if (!p) throw new NotFoundException(`Pasarela no soportada: ${id}`);
    return p;
  }

  private async appointmentByToken(businessId: string, token: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { businessId, accessTokenHash: sha256Hex(token) },
      include: { customer: true, business: { select: { currency: true } } },
    });
    if (!appt) throw new NotFoundException('No encontramos esta cita. Revisa el enlace');
    return appt;
  }
}
