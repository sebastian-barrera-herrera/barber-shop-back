import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  api,
  createBusiness,
  createScheduleFixture,
  createTestApp,
  localIso,
  login,
  nextMonday,
  resetDatabase,
  type CapturedMail,
} from './setup/test-app';

const waitForMail = async (mails: CapturedMail[], n: number) => {
  const end = Date.now() + 3000;
  while (mails.length < n) {
    if (Date.now() > end) throw new Error(`Se esperaban ${n} correos y hay ${mails.length}`);
    await new Promise((r) => setTimeout(r, 30));
  }
};

describe('Correos al cliente (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mails: CapturedMail[];
  let fx: Awaited<ReturnType<typeof createScheduleFixture>>;
  let owner: string;
  const MONDAY = nextMonday();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma, mails } = await createTestApp());
    await resetDatabase(prisma);
    const a = await createBusiness(prisma, 'alpha');
    fx = await createScheduleFixture(prisma, a.business.id, a.professional.id);
    owner = (await login(app, 'owner@alpha.test')).token;
  });

  beforeEach(() => mails.splice(0));
  afterAll(() => app.close());

  const book = (hhmm: string, email?: string) =>
    http()
      .post(api('/public/alpha/appointments'))
      .send({
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, hhmm),
        customer: { name: 'Juan Pérez', phone: '3001234567', ...(email ? { email } : {}) },
      });

  it('al reservar con correo, llega la confirmación con el enlace privado y el evento de calendario', async () => {
    const res = await book('10:00', 'juan@correo.com');
    expect(res.status).toBe(201);
    await waitForMail(mails, 1);
    const [mail] = mails;
    expect(mail.to).toBe('juan@correo.com');
    expect(mail.subject).toBe('Recibimos tu reserva en Negocio alpha');
    expect(mail.html).toContain(`/cita/${res.body.manageToken}`);
    expect(mail.text).toContain(`/cita/${res.body.manageToken}`);
    expect(mail.attachments?.[0]).toMatchObject({ filename: 'cita.ics' });
    expect(mail.attachments?.[0].content).toContain('SUMMARY:Corte · Negocio alpha');
  });

  it('sin correo no se envía nada (el cliente es el mismo por teléfono)', async () => {
    await book('11:00');
    await new Promise((r) => setTimeout(r, 200));
    // El cliente ya tenía correo guardado de la reserva anterior: se usa ese.
    expect(mails.map((m) => m.to)).toEqual(['juan@correo.com']);

    mails.splice(0);
    await http()
      .post(api('/public/alpha/appointments'))
      .send({
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, '12:00'),
        customer: { name: 'Sin Correo', phone: '3150009999' },
      });
    await new Promise((r) => setTimeout(r, 200));
    expect(mails).toHaveLength(0);
  });

  it('cuando el negocio confirma una cita pendiente, el cliente recibe "confirmada"', async () => {
    const appt = await prisma.appointment.findFirstOrThrow({
      where: { customer: { email: 'juan@correo.com' }, status: 'PENDING' },
    });
    await http()
      .post(api(`/appointments/${appt.id}/status`))
      .set('Authorization', `Bearer ${owner}`)
      .send({ status: 'CONFIRMED' })
      .expect(200);
    await waitForMail(mails, 1);
    expect(mails[0].subject).toMatch(/^Confirmada: tu cita en Negocio alpha/);
  });

  it('cuando el negocio cancela, el cliente recibe el aviso con el motivo', async () => {
    const appt = await prisma.appointment.findFirstOrThrow({
      where: { customer: { email: 'juan@correo.com' }, status: 'CONFIRMED' },
    });
    await http()
      .post(api(`/appointments/${appt.id}/status`))
      .set('Authorization', `Bearer ${owner}`)
      .send({ status: 'CANCELLED', reason: 'Carlos está incapacitado' })
      .expect(200);
    await waitForMail(mails, 1);
    expect(mails[0].subject).toContain('Cancelada');
    expect(mails[0].html).toContain('Carlos está incapacitado');
  });

  it('si el cliente cancela desde su enlace, no se le envía correo (avisa al equipo)', async () => {
    const res = await book('14:00', 'juan@correo.com');
    await waitForMail(mails, 1);
    mails.splice(0);
    await http()
      .post(api(`/public/alpha/appointments/by-token/${res.body.manageToken}/cancel`))
      .send({})
      .expect(200);
    await new Promise((r) => setTimeout(r, 200));
    expect(mails).toHaveLength(0);
  });

  it('una reserva manual del panel también envía la confirmación', async () => {
    const res = await http()
      .post(api('/appointments'))
      .set('Authorization', `Bearer ${owner}`)
      .send({
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, '15:00'),
        customer: { name: 'Ana Ruiz', phone: '3107778888', email: 'ana@correo.com' },
      });
    expect(res.status).toBe(201);
    await waitForMail(mails, 1);
    expect(mails[0]).toMatchObject({ to: 'ana@correo.com' });
    expect(mails[0].subject).toMatch(/^Tu cita en Negocio alpha:/); // confirmada de una vez
  });

  it('si el negocio mueve la cita a otra hora, el cliente recibe "cambió" con el .ics nuevo', async () => {
    const appt = await prisma.appointment.findFirstOrThrow({
      where: { customer: { email: 'ana@correo.com' }, status: 'CONFIRMED' },
    });
    mails.splice(0);
    await http()
      .patch(api(`/appointments/${appt.id}`))
      .set('Authorization', `Bearer ${owner}`)
      .send({ startsAt: localIso(MONDAY, '16:00') })
      .expect(200);
    await waitForMail(mails, 1);
    expect(mails[0].subject).toMatch(/^Tu cita en Negocio alpha cambió:/);
    expect(mails[0].text).toMatch(/Antes: .* a las 3:00/);
    expect(mails[0].attachments?.[0]).toMatchObject({ filename: 'cita.ics' });

    // Cambiar solo las notas no envía nada.
    mails.splice(0);
    await http()
      .patch(api(`/appointments/${appt.id}`))
      .set('Authorization', `Bearer ${owner}`)
      .send({ notes: 'Trae foto de referencia' })
      .expect(200);
    await new Promise((r) => setTimeout(r, 200));
    expect(mails).toHaveLength(0);
  });
});
