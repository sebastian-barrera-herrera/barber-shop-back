import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/** Ventanas de recordatorio: "tu cita es mañana" (24 h) y "en 2 horas". */
export const REMINDER_WINDOWS = [
  { field: 'reminder24hSentAt', hours: 24, label: 'mañana' },
  { field: 'reminder2hSentAt', hours: 2, label: 'en 2 horas' },
] as const;

/** Margen de la ventana = frecuencia del job, para no saltarse citas. */
const WINDOW_MINUTES = 10;

/**
 * Recordatorios automáticos a clientes. Quedan listos pero solo corren si REMINDERS_ENABLED=true
 * y existe un canal hacia el cliente (email/WhatsApp/SMS); sin canal no hay por dónde enviarlos.
 */
@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    if (this.config.get('REMINDERS_ENABLED') && !this.notifications.hasCustomerChannel()) {
      this.logger.warn(
        'REMINDERS_ENABLED=true pero no hay canal hacia el cliente; los recordatorios no se enviarán.',
      );
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async tick() {
    if (!this.config.get('REMINDERS_ENABLED') || !this.notifications.hasCustomerChannel()) return;
    await this.run(new Date());
  }

  /** Envía los recordatorios que correspondan en este momento. Devuelve cuántos se enviaron. */
  async run(now: Date): Promise<number> {
    let sent = 0;
    for (const w of REMINDER_WINDOWS) {
      const from = new Date(now.getTime() + w.hours * 3_600_000 - WINDOW_MINUTES * 60_000);
      const to = new Date(now.getTime() + w.hours * 3_600_000);
      const due = await this.prisma.appointment.findMany({
        where: {
          status: { in: ['PENDING', 'CONFIRMED'] },
          startsAt: { gt: from, lte: to },
          [w.field]: null,
        },
        include: {
          customer: true,
          business: { select: { name: true, timezone: true } },
          professional: { select: { name: true } },
        },
        take: 200,
      });

      for (const a of due) {
        const time = new Intl.DateTimeFormat('es-CO', {
          timeZone: a.business.timezone,
          hour: 'numeric',
          minute: '2-digit',
        }).format(a.startsAt);
        const delivered = await this.notifications.notify({
          businessId: a.businessId,
          audience: 'CUSTOMER',
          type: `reminder.${w.hours}h`,
          title: `Tu cita en ${a.business.name} es ${w.label} a las ${time}`,
          body: `${a.serviceNameSnapshot} con ${a.professional.name}`,
          customer: { name: a.customer.name, phone: a.customer.phone, email: a.customer.email },
          data: { appointmentId: a.id },
        });
        if (delivered > 0) {
          await this.prisma.appointment.update({
            where: { id: a.id },
            data: { [w.field]: new Date() },
          });
          sent++;
        }
      }
    }
    return sent;
  }
}
