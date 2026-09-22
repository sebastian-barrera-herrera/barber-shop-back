import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.service';
import { BusinessService } from '../../business/business.service';
import { buildIcs } from '../email/ics';
import { MAIL_TRANSPORT, type MailTransport } from '../email/mail-transport';
import {
  bookingEmail,
  cancelledEmail,
  confirmedEmail,
  reminderEmail,
  type EmailAppointment,
  type EmailBusiness,
  type RenderedEmail,
} from '../email/templates';
import type { NotificationChannel, OutgoingNotification } from './notification-channel';

/** Datos que acompañan un aviso al cliente para poder armar el correo. */
export interface EmailPayload {
  appointmentId: string;
  appointment: EmailAppointment & { startsAt: string | Date };
  manageToken?: string;
  reason?: string | null;
}

const ACCENT: Record<string, string> = {
  studio: '#A07C42',
  barber: '#9A7536',
  spa: '#5E7A5D',
  nails: '#9E2B3A',
  beauty: '#A8553A',
};
const SUPPORTED = [
  'appointment.booked',
  'appointment.confirmed',
  'appointment.cancelled.byBusiness',
  'reminder.24h',
  'reminder.2h',
];

/**
 * Correos al cliente. Solo aplica si hay SMTP configurado y el cliente dejó su correo.
 * Con este canal activo, también salen los recordatorios (REMINDERS_ENABLED=true).
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly name = 'email';

  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    private readonly business: BusinessService,
    private readonly config: AppConfig,
  ) {}

  supports(n: OutgoingNotification) {
    if (n.audience !== 'CUSTOMER' || !this.transport.enabled) return false;
    // Sondeo de capacidad (sin cliente concreto): "¿existe un canal hacia el cliente?"
    if (n.type === 'probe') return true;
    return !!n.customer?.email && SUPPORTED.includes(n.type) && !!n.data?.email;
  }

  async send(n: OutgoingNotification) {
    const payload = n.data!.email as EmailPayload;
    const ctx = await this.business.getSchedulingContext(n.businessId);
    const b: EmailBusiness = {
      name: ctx.name,
      address: ctx.address,
      city: ctx.city,
      phone: ctx.phone,
      whatsapp: ctx.whatsapp,
      timezone: ctx.timezone,
      currency: ctx.currency,
      accent:
        ctx.settings.branding.secondaryColor.toUpperCase() !== '#A8854A'
          ? ctx.settings.branding.secondaryColor
          : (ACCENT[ctx.settings.branding.preset] ?? ACCENT.studio),
      cancellationWindowHours: ctx.settings.booking.cancellationWindowHours,
    };
    const a: EmailAppointment = {
      ...payload.appointment,
      startsAt: new Date(payload.appointment.startsAt),
    };
    const web = this.config.get('WEB_URL');
    const manageUrl = payload.manageToken
      ? `${web}/cita/${encodeURIComponent(payload.manageToken)}`
      : undefined;

    let email: RenderedEmail;
    let withCalendar = false;
    switch (n.type) {
      case 'appointment.booked':
        email = bookingEmail(b, a, manageUrl);
        withCalendar = true;
        break;
      case 'appointment.confirmed':
        email = confirmedEmail(b, a);
        withCalendar = true;
        break;
      case 'appointment.cancelled.byBusiness':
        email = cancelledEmail(b, a, payload.reason ?? null, `${web}/reservar`);
        break;
      default:
        email = reminderEmail(b, a, n.type === 'reminder.2h' ? 'en 2 horas' : 'mañana');
    }

    await this.transport.send({
      to: n.customer!.email!,
      ...email,
      replyTo: undefined,
      attachments: withCalendar
        ? [
            {
              filename: 'cita.ics',
              contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
              content: buildIcs({
                uid: payload.appointmentId,
                title: `${a.serviceName} · ${b.name}`,
                start: a.startsAt,
                end: new Date(a.startsAt.getTime() + a.durationMinutes * 60_000),
                location: [b.address, b.city].filter(Boolean).join(', ') || undefined,
                description: `Con ${a.professionalName}.${manageUrl ? ` Ver o cancelar: ${manageUrl}` : ''}`,
              }),
            },
          ]
        : undefined,
    });
  }
}
