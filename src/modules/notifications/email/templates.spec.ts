import {
  bookingEmail,
  cancelledEmail,
  confirmedEmail,
  escapeHtml,
  reminderEmail,
  type EmailAppointment,
  type EmailBusiness,
} from './templates';

const business: EmailBusiness = {
  name: 'Studio Demo',
  address: 'Calle 85 # 11-20',
  city: 'Bogotá',
  phone: '+573001234567',
  whatsapp: '+573001234567',
  timezone: 'America/Bogota',
  currency: 'COP',
  accent: '#A07C42',
  cancellationWindowHours: 4,
};

const appt = (over: Partial<EmailAppointment> = {}): EmailAppointment => ({
  customerName: 'Juan Pérez',
  serviceName: 'Corte clásico',
  professionalName: 'Carlos',
  startsAt: new Date('2026-09-25T21:00:00Z'), // viernes 4:00 p. m. en Bogotá
  durationMinutes: 45,
  priceCents: 3_500_000,
  status: 'CONFIRMED',
  ...over,
});

describe('plantillas de correo', () => {
  it('reserva confirmada: asunto con fecha, ticket, total y enlace para gestionar', () => {
    const e = bookingEmail(business, appt(), 'http://localhost:3000/cita/tok123');
    expect(e.subject).toMatch(/^Tu cita en Studio Demo: viernes, 25 de septiembre, 4:00/);
    expect(e.text).toContain('Te esperamos, Juan.');
    expect(e.html).toContain('<em style="color:#A07C42;">Juan.</em>');
    expect(e.html).toContain('Corte clásico');
    expect(e.html).toContain('$35.000');
    expect(e.html).toContain('href="http://localhost:3000/cita/tok123"');
    expect(e.html).toContain('hasta 4 h antes');
    expect(e.text).toContain('Ver o cancelar tu cita: http://localhost:3000/cita/tok123');
    expect(e.text).toContain('Hora: 4:00');
  });

  it('reserva pendiente: "recibimos tu reserva"', () => {
    const e = bookingEmail(business, appt({ status: 'PENDING' }), 'http://x/cita/t');
    expect(e.subject).toBe('Recibimos tu reserva en Studio Demo');
    expect(e.html).toContain('la confirmará pronto');
  });

  it('escapa lo que escribe el cliente (sin HTML inyectado)', () => {
    const e = bookingEmail(
      business,
      appt({ customerName: '<script>alert(1)</script> Ana' }),
      'http://x/cita/t',
    );
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;');
    expect(escapeHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });

  it('confirmación, cancelación y recordatorio', () => {
    expect(confirmedEmail(business, appt()).subject).toContain(
      'Confirmada: tu cita en Studio Demo',
    );

    const c = cancelledEmail(
      business,
      appt(),
      'El profesional está incapacitado',
      'http://x/reservar',
    );
    expect(c.subject).toContain('Cancelada');
    expect(c.html).toContain('Motivo: El profesional está incapacitado');
    expect(c.html).toContain('href="http://x/reservar"');

    const r = reminderEmail(business, appt(), 'mañana');
    expect(r.subject).toMatch(/^Recordatorio: tu cita en Studio Demo es mañana a las 4:00/);
    expect(r.html).not.toContain('Total'); // el recordatorio no repite el cobro
  });
});
