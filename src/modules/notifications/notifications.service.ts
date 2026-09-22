import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  EVENTS,
  type AppointmentEvent,
  type MessageEvent,
  type PaymentEvent,
} from '../../common/events';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessService } from '../business/business.service';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type OutgoingNotification,
} from './channels/notification-channel';

const money = (cents: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(cents / 100);

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
    private readonly prisma: PrismaService,
    private readonly business: BusinessService,
  ) {}

  /** Envía por todos los canales que apliquen. Un canal que falla no bloquea a los demás. */
  async notify(n: OutgoingNotification): Promise<number> {
    const targets = this.channels.filter((c) => c.supports(n));
    const results = await Promise.allSettled(targets.map((c) => c.send(n)));
    results.forEach((r, i) => {
      if (r.status === 'rejected')
        this.logger.error(`Canal ${targets[i].name} falló: ${String(r.reason)}`);
    });
    return results.filter((r) => r.status === 'fulfilled').length;
  }

  /** ¿Hay algún canal hacia el cliente? (sin él, los recordatorios no tienen cómo salir) */
  hasCustomerChannel(): boolean {
    return this.channels.some((c) =>
      c.supports({ audience: 'CUSTOMER', businessId: '', type: 'probe', title: '' }),
    );
  }

  // ───────────── Reacciones a eventos ─────────────

  @OnEvent(EVENTS.appointmentCreated, { async: true })
  async onAppointmentCreated(e: AppointmentEvent) {
    if (e.source !== 'WEB') return; // las del panel las creó el propio equipo
    const when = await this.when(e.businessId, e.startsAt);
    await this.notify({
      businessId: e.businessId,
      audience: 'STAFF',
      type: 'appointment.created',
      title: `Nueva reserva: ${e.customerName}`,
      body: `${e.serviceName} con ${e.professionalName} · ${when}`,
      data: { appointmentId: e.appointmentId },
    });
  }

  @OnEvent(EVENTS.appointmentCancelled, { async: true })
  async onAppointmentCancelled(e: AppointmentEvent) {
    if (e.source !== 'CUSTOMER') return;
    const when = await this.when(e.businessId, e.startsAt);
    await this.notify({
      businessId: e.businessId,
      audience: 'STAFF',
      type: 'appointment.cancelled',
      title: `${e.customerName} canceló su cita`,
      body: `${e.serviceName} con ${e.professionalName} · ${when}`,
      data: { appointmentId: e.appointmentId },
    });
  }

  @OnEvent(EVENTS.messageReceived, { async: true })
  async onMessage(e: MessageEvent) {
    await this.notify({
      businessId: e.businessId,
      audience: 'STAFF',
      type: 'message.received',
      title: `Mensaje de ${e.customerName}`,
      body: e.preview,
      data: { conversationId: e.conversationId },
    });
  }

  @OnEvent(EVENTS.paymentUpdated, { async: true })
  async onPayment(e: PaymentEvent) {
    if (e.status !== 'PAID' && e.status !== 'FAILED') return;
    await this.notify({
      businessId: e.businessId,
      audience: 'STAFF',
      type: `payment.${e.status.toLowerCase()}`,
      title:
        e.status === 'PAID'
          ? `Pago recibido: ${money(e.amountCents)}`
          : 'Un pago en línea no se completó',
      body: e.customerName,
      data: { appointmentId: e.appointmentId },
    });
  }

  // ───────────── Panel ─────────────

  async list(businessId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.notification.count({ where: { businessId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markAllRead(businessId: string) {
    await this.prisma.notification.updateMany({
      where: { businessId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  private async when(businessId: string, date: Date) {
    const { timezone } = await this.business.getSchedulingContext(businessId);
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
}
