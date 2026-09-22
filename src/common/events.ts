/**
 * Eventos de dominio. Los módulos los emiten sin saber quién escucha
 * (notificaciones hoy; email, WhatsApp o Google Calendar mañana).
 */
export const EVENTS = {
  appointmentCreated: 'appointment.created',
  appointmentCancelled: 'appointment.cancelled',
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
