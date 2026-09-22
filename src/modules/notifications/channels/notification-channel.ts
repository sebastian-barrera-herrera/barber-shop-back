/**
 * Un aviso puede ir al equipo del negocio (panel) o al cliente (recordatorios, confirmaciones).
 * Cada canal decide si le aplica. Agregar WhatsApp/Email/SMS/Push = implementar esta interfaz
 * y registrarla en NotificationsModule; nada más cambia.
 */
export type Audience = 'STAFF' | 'CUSTOMER';

export interface OutgoingNotification {
  businessId: string;
  audience: Audience;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  /** Destinatario cuando la audiencia es el cliente */
  customer?: { name: string; phone: string; email?: string | null };
}

export interface NotificationChannel {
  readonly name: string;
  supports(n: OutgoingNotification): boolean;
  send(n: OutgoingNotification): Promise<void>;
}

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

/*
 * Canales previstos (no implementados en esta versión):
 *   EmailChannel     → proveedor SMTP/Resend/SES, audiencia CUSTOMER con email
 *   WhatsAppChannel  → WhatsApp Business API (plantillas aprobadas), audiencia CUSTOMER
 *   SmsChannel       → Twilio u otro, audiencia CUSTOMER
 *   PushChannel      → Web Push para el panel, audiencia STAFF
 */
