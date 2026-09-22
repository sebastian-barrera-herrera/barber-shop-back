/**
 * Eventos de dominio. Los módulos los emiten sin saber quién escucha
 * (notificaciones hoy; email, WhatsApp o Google Calendar mañana).
 */
export const EVENTS = {
  appointmentCreated: 'appointment.created',
  appointmentCancelled: 'appointment.cancelled',
  appointmentConfirmed: 'appointment.confirmed',
  messageReceived: 'message.received',
  paymentUpdated: 'payment.updated',
} as const;

export interface AppointmentEvent {
  businessId: string;
  appointmentId: string;
  customerName: string;
  serviceName: string;
  professionalName: string;
  startsAt: Date;
  source: 'WEB' | 'ADMIN' | 'CUSTOMER';
  /** Para avisar al cliente (correo de confirmación, cancelación…) */
  customer?: { name: string; phone: string; email?: string | null };
  status?: string;
  durationMinutes?: number;
  priceCents?: number;
  cancelReason?: string | null;
  /** Solo al crear la cita: el token del enlace privado (nunca se guarda en claro) */
  manageToken?: string;
}

export interface MessageEvent {
  businessId: string;
  conversationId: string;
  customerName: string;
  preview: string;
}

export interface PaymentEvent {
  businessId: string;
  appointmentId: string;
  customerName: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  amountCents: number;
}
