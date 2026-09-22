import { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
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
} from './setup/test-app';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const waitFor = async <T>(
  fn: () => Promise<T | null | undefined | false>,
  ms = 3000,
): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('Fase 2: chat, notificaciones, pagos, configuración, archivos, reportes y búsqueda (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Awaited<ReturnType<typeof createScheduleFixture>>;
  let businessId: string;
  let owner: string;
  let admin: string;
  let carlosToken: string;
  let ownerB: string;
  const MONDAY = nextMonday();
  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let token: string; // enlace privado de una cita reservada en la web

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    const a = await createBusiness(prisma, 'alpha');
    await createBusiness(prisma, 'beta');
    businessId = a.business.id;
    fx = await createScheduleFixture(prisma, businessId, a.professional.id);
    owner = (await login(app, 'owner@alpha.test')).token;
    admin = (await login(app, 'admin@alpha.test')).token;
    carlosToken = (await login(app, 'professional@alpha.test')).token;
    ownerB = (await login(app, 'owner@beta.test')).token;

    const res = await http()
      .post(api('/public/alpha/appointments'))
      .send({
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, '10:00'),
        customer: { name: 'Juan Pérez', phone: '3001234567', email: 'juan@correo.com' },
      });
    token = res.body.manageToken;
  });

  afterAll(() => app.close());

  describe('notificaciones', () => {
    it('una reserva hecha en la web avisa al equipo', async () => {
      const n = await waitFor(async () => {
        const r = await http().get(api('/notifications')).set(auth(owner));
        return r.body.unread > 0 ? r.body : null;
      });
      expect(n.items[0]).toMatchObject({
        type: 'appointment.created',
        title: 'Nueva reserva: Juan Pérez',
      });
      expect(n.items[0].body).toContain('Corte con Carlos');

      await http().post(api('/notifications/read')).set(auth(owner)).expect(204);
      expect((await http().get(api('/notifications')).set(auth(owner))).body.unread).toBe(0);
      await http().get(api('/notifications')).set(auth(carlosToken)).expect(403);
    });
  });

  describe('chat (paso 14)', () => {
    let conversationId: string;

    it('el cliente escribe desde el enlace de su cita', async () => {
      const empty = await http().get(api(`/public/alpha/appointments/by-token/${token}/messages`));
      expect(empty.body.messages).toEqual([]);

      const sent = await http()
        .post(api(`/public/alpha/appointments/by-token/${token}/messages`))
        .send({ body: '  Hola, ¿puedo cambiar mi cita para las 5?  ' });
      expect(sent.status).toBe(201);
      expect(sent.body).toMatchObject({
        sender: 'CUSTOMER',
        body: 'Hola, ¿puedo cambiar mi cita para las 5?',
      });
    });

    it('el negocio ve la conversación con contador de no leídos y un aviso', async () => {
      const unread = await http().get(api('/conversations/unread')).set(auth(admin));
      expect(unread.body).toEqual({ unread: 1 });

      const list = await http().get(api('/conversations')).set(auth(admin));
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({
        unreadForBusiness: 1,
        customer: { name: 'Juan Pérez' },
        lastMessage: { sender: 'CUSTOMER' },
      });
      conversationId = list.body[0].id;

      await waitFor(() =>
        prisma.notification.findFirst({ where: { businessId, type: 'message.received' } }),
      );
    });

    it('responder deja la conversación leída y el cliente ve la respuesta', async () => {
      await http()
        .post(api(`/conversations/${conversationId}/read`))
        .set(auth(admin))
        .expect(204);
      const reply = await http()
        .post(api(`/conversations/${conversationId}/messages`))
        .set(auth(admin))
        .send({ body: 'Claro, tenemos disponibilidad.' });
      expect(reply.status).toBe(201);
      expect((await http().get(api('/conversations/unread')).set(auth(admin))).body).toEqual({
        unread: 0,
      });

      const thread = await http().get(api(`/public/alpha/appointments/by-token/${token}/messages`));
      expect(thread.body.messages.map((m: { sender: string }) => m.sender)).toEqual([
        'CUSTOMER',
        'STAFF',
      ]);
      const staffMsg = await prisma.message.findFirst({ where: { sender: 'STAFF' } });
      expect(staffMsg?.readAt).not.toBeNull(); // el cliente lo leyó al abrir
    });

    it('el negocio puede escribirle primero a un cliente', async () => {
      const c = await prisma.customer.create({
        data: { businessId, name: 'Ana', phone: '+573109876543' },
      });
      const res = await http()
        .post(api('/conversations'))
        .set(auth(owner))
        .send({ customerId: c.id, body: 'Hola Ana' });
      expect(res.status).toBe(201);
      expect(res.body.message).toMatchObject({ sender: 'STAFF', body: 'Hola Ana' });
    });

    it('valida y aísla: mensaje vacío, token falso, otro negocio y profesional', async () => {
      await http()
        .post(api(`/public/alpha/appointments/by-token/${token}/messages`))
        .send({ body: '   ' })
        .expect(400);
      await http()
        .post(api('/public/alpha/appointments/by-token/falso/messages'))
        .send({ body: 'hola' })
        .expect(404);
      await http()
        .get(api(`/conversations/${conversationId}/messages`))
        .set(auth(ownerB))
        .expect(404);
      await http().get(api('/conversations')).set(auth(carlosToken)).expect(403);
    });
  });

  describe('configuración (paso 16)', () => {
    it('el dueño cambia marca, horario, redes y reglas de reserva; la web pública lo refleja', async () => {
      const branding = await http()
        .patch(api('/settings/branding'))
        .set(auth(owner))
        .send({ preset: 'barber', heroTitle: 'Cortes con oficio.' });
      expect(branding.status).toBe(200);
      expect(branding.body.branding).toMatchObject({
        preset: 'barber',
        heroTitle: 'Cortes con oficio.',
        animations: true,
      });

      const booking = await http()
        .patch(api('/settings/booking'))
        .set(auth(owner))
        .send({ autoConfirm: true, bufferMinutes: 10 });
      expect(booking.body.booking).toMatchObject({
        autoConfirm: true,
        bufferMinutes: 10,
        slotStepMinutes: 15,
      });

      const social = await http()
        .patch(api('/settings/social'))
        .set(auth(owner))
        .send({ instagram: 'https://instagram.com/alpha' });
      expect(social.body.social.instagram).toBe('https://instagram.com/alpha');

      const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        closed: weekday === 0,
        open: '08:00',
        close: '20:00',
      }));
      const hours = await http().patch(api('/settings/openingHours')).set(auth(owner)).send(days);
      expect(hours.body.openingHours[1]).toMatchObject({ open: '08:00', close: '20:00' });

      const pub = await http().get(api('/public/alpha/business'));
      expect(pub.body.branding.heroTitle).toBe('Cortes con oficio.');
      expect(pub.body.onlinePayments).toBe(false);

      // restaurar para no afectar otras pruebas
      await http()
        .patch(api('/settings/booking'))
        .set(auth(owner))
        .send({ autoConfirm: false, bufferMinutes: 0 });
    });

    it('rechaza valores inválidos, campos extra y a quien no es dueño', async () => {
      await http()
        .patch(api('/settings/branding'))
        .set(auth(owner))
        .send({ primaryColor: 'rojo' })
        .expect(400);
      await http()
        .patch(api('/settings/booking'))
        .set(auth(owner))
        .send({ slotStepMinutes: 7 })
        .expect(400);
      await http()
        .patch(api('/settings/booking'))
        .set(auth(owner))
        .send({ hackeado: true })
        .expect(400);
      await http()
        .patch(api('/settings/openingHours'))
        .set(auth(owner))
        .send([{ weekday: 1, closed: false, open: '10:00', close: '09:00' }])
        .expect(400);
      await http().patch(api('/settings/nada')).set(auth(owner)).send({}).expect(404);
      await http()
        .patch(api('/settings/branding'))
        .set(auth(admin))
        .send({ preset: 'spa' })
        .expect(403);
    });
  });

  describe('pagos con Wompi (paso 15)', () => {
    const secrets = {
      privateKey: 'prv_test_zzz',
      integritySecret: 'test_integrity_abc',
      eventsSecret: 'test_events_def',
    };

    it('conectar Wompi: valida llaves y nunca devuelve secretos', async () => {
      await http()
        .put(api('/payments/settings/wompi'))
        .set(auth(owner))
        .send({ environment: 'SANDBOX', publicKey: 'pub_test_abc', isEnabled: true })
        .expect(400); // faltan secretos

      await http()
        .put(api('/payments/settings/wompi'))
        .set(auth(owner))
        .send({ environment: 'SANDBOX', publicKey: 'pub_prod_abc', isEnabled: true, ...secrets })
        .expect(400); // llave de producción en ambiente de pruebas

      const res = await http()
        .put(api('/payments/settings/wompi'))
        .set(auth(owner))
        .send({ environment: 'SANDBOX', publicKey: 'pub_test_abc', isEnabled: true, ...secrets });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        isEnabled: true,
        publicKey: 'pub_test_abc',
        configuredSecrets: { privateKey: true, integritySecret: true, eventsSecret: true },
      });
      expect(JSON.stringify(res.body)).not.toContain('prv_test_zzz');

      const row = await prisma.paymentProviderConfig.findFirstOrThrow({ where: { businessId } });
      expect(row.encryptedSecrets).not.toContain('prv_test_zzz'); // cifrado en la BD

      // Guardar sin reenviar secretos los conserva
      const again = await http()
        .put(api('/payments/settings/wompi'))
        .set(auth(owner))
        .send({ environment: 'SANDBOX', publicKey: 'pub_test_abc', isEnabled: true });
      expect(again.body.configuredSecrets.eventsSecret).toBe(true);

      await http().get(api('/payments/settings/wompi')).set(auth(admin)).expect(403);
      expect((await http().get(api('/public/alpha/business'))).body.onlinePayments).toBe(true);
    });

    let reference: string;

    it('el cliente inicia el pago desde su enlace: URL firmada y cita en "pago pendiente"', async () => {
      const res = await http().post(api(`/public/alpha/appointments/by-token/${token}/payments`));
      expect(res.status).toBe(201);
      const url = new URL(res.body.url);
      reference = url.searchParams.get('reference')!;
      expect(url.searchParams.get('amount-in-cents')).toBe('3500000');
      expect(url.searchParams.get('signature:integrity')).toBe(
        sha(`${reference}3500000COP${secrets.integritySecret}`),
      );
      expect(url.searchParams.get('redirect-url')).toContain(`/alpha/cita/${token}?pago=1`);

      const view = await http().get(api(`/public/alpha/appointments/by-token/${token}`));
      expect(view.body.paymentStatus).toBe('PENDING');
    });

    const signedEvent = (
      status: string,
      amount = 3500000,
      secret = secrets.eventsSecret,
      txId = 'wompi-tx-1',
    ) => {
      const transaction = { id: txId, reference, status, amount_in_cents: amount, currency: 'COP' };
      const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
      const timestamp = 1727000000;
      return {
        event: 'transaction.updated',
        data: { transaction },
        signature: { properties, checksum: sha(`${txId}${status}${amount}${timestamp}${secret}`) },
        timestamp,
      };
    };

    it('rechaza webhooks con firma falsa o monto alterado', async () => {
      await http()
        .post(api('/payments/webhooks/wompi'))
        .send(signedEvent('APPROVED', 3500000, 'otro-secreto'))
        .expect(401);

      await http()
        .post(api('/payments/webhooks/wompi'))
        .send(signedEvent('APPROVED', 100))
        .expect(200);
      const p = await prisma.payment.findUniqueOrThrow({ where: { providerReference: reference } });
      expect(p.status).toBe('FAILED'); // firmado pero con monto distinto al de la cita
    });

    it('webhook válido marca el pago como aprobado (e idempotente)', async () => {
      const start = await http().post(api(`/public/alpha/appointments/by-token/${token}/payments`));
      reference = new URL(start.body.url).searchParams.get('reference')!;

      const ok = signedEvent('APPROVED', 3500000, secrets.eventsSecret, 'wompi-tx-2');
      await http().post(api('/payments/webhooks/wompi')).send(ok).expect(200);
      await http().post(api('/payments/webhooks/wompi')).send(ok).expect(200);

      const payment = await prisma.payment.findUniqueOrThrow({
        where: { providerReference: reference },
      });
      expect(payment).toMatchObject({ status: 'PAID', providerTransactionId: 'wompi-tx-2' });
      const view = await http().get(api(`/public/alpha/appointments/by-token/${token}`));
      expect(view.body.paymentStatus).toBe('PAID');

      await http()
        .post(api(`/public/alpha/appointments/by-token/${token}/payments`))
        .expect(400); // ya pagada
      await waitFor(() =>
        prisma.notification.findFirst({ where: { businessId, type: 'payment.paid' } }),
      );

      const list = await http().get(api('/payments')).set(auth(admin));
      expect(
        list.body.items.find((x: { status: string }) => x.status === 'PAID').appointment.customer
          .name,
      ).toBe('Juan Pérez');
    });

    it('con pago obligatorio, la cita queda pendiente y se confirma al volver de la pasarela', async () => {
      await http()
        .patch(api('/settings/booking'))
        .set(auth(owner))
        .send({ paymentMode: 'REQUIRED', autoConfirm: true });
      const booked = await http()
        .post(api('/public/alpha/appointments'))
        .send({
          serviceId: fx.corte.id,
          professionalId: fx.carlos.id,
          startsAt: localIso(MONDAY, '15:00'),
          customer: { name: 'Pagador', phone: '3150001234' },
        });
      expect(booked.body.appointment.status).toBe('PENDING');
      const t2 = booked.body.manageToken;
      const start = await http().post(api(`/public/alpha/appointments/by-token/${t2}/payments`));
      const ref2 = new URL(start.body.url).searchParams.get('reference')!;

      // Al volver, se consulta a Wompi (simulado): APPROVED
      const realFetch = global.fetch;
      global.fetch = jest.fn(async (url: string | URL | Request) => {
        expect(String(url)).toBe('https://sandbox.wompi.co/v1/transactions/tx-2');
        return new Response(
          JSON.stringify({
            data: {
              id: 'tx-2',
              reference: ref2,
              status: 'APPROVED',
              amount_in_cents: 3500000,
              currency: 'COP',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as typeof fetch;
      try {
        const verify = await http()
          .post(api(`/public/alpha/appointments/by-token/${t2}/payments/verify`))
          .send({ transactionId: 'tx-2' });
        expect(verify.body).toEqual({ status: 'PAID' });
      } finally {
        global.fetch = realFetch;
      }
      const view = await http().get(api(`/public/alpha/appointments/by-token/${t2}`));
      expect(view.body).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });

      await http()
        .patch(api('/settings/booking'))
        .set(auth(owner))
        .send({ paymentMode: 'NONE', autoConfirm: false });
    });

    it('registrar un reembolso (solo el dueño)', async () => {
      const paid = await prisma.payment.findFirstOrThrow({ where: { businessId, status: 'PAID' } });
      await http()
        .post(api(`/payments/${paid.id}/refunded`))
        .set(auth(admin))
        .expect(403);
      await http()
        .post(api(`/payments/${paid.id}/refunded`))
        .set(auth(owner))
        .expect(204);
      await http()
        .post(api(`/payments/${paid.id}/refunded`))
        .set(auth(owner))
        .expect(400);
    });
  });

  describe('archivos', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    it('sube una imagen real y la sirve', async () => {
      const res = await http()
        .post(api('/uploads'))
        .set(auth(admin))
        .attach('file', png, 'logo.png');
      expect(res.status).toBe(201);
      expect(res.body.url).toMatch(/\/uploads\/[\w-]+\/[\w-]+\.png$/);
      const path = new URL(res.body.url).pathname;
      const served = await http().get(path);
      expect(served.status).toBe(200);
      expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('rechaza archivos que no son imágenes aunque digan serlo', async () => {
      const res = await http()
        .post(api('/uploads'))
        .set(auth(admin))
        .attach('file', Buffer.from('<script>alert(1)</script>'), {
          filename: 'foto.png',
          contentType: 'image/png',
        });
      expect(res.status).toBe(400);
      await http()
        .post(api('/uploads'))
        .set(auth(carlosToken))
        .attach('file', png, 'x.png')
        .expect(403);
    });
  });

  describe('reportes y búsqueda', () => {
    it('reporte del rango', async () => {
      const res = await http()
        .get(api('/reports'))
        .query({ from: MONDAY, to: MONDAY })
        .set(auth(owner));
      expect(res.status).toBe(200);
      expect(res.body.totals).toMatchObject({ appointments: 2 });
      expect(res.body.byDay).toHaveLength(1);
      expect(res.body.topServices[0]).toMatchObject({ name: 'Corte' });
      await http()
        .get(api('/reports'))
        .query({ from: MONDAY, to: '2020-01-01' })
        .set(auth(owner))
        .expect(400);
      await http()
        .get(api('/reports'))
        .query({ from: MONDAY, to: MONDAY })
        .set(auth(carlosToken))
        .expect(403);
    });

    it('buscador: clientes, citas y servicios; respeta el alcance del profesional', async () => {
      const res = await http().get(api('/search')).query({ q: 'juan' }).set(auth(admin));
      expect(res.body.customers.map((c: { name: string }) => c.name)).toContain('Juan Pérez');
      expect(res.body.appointments.length).toBeGreaterThan(0);

      const byPhone = await http().get(api('/search')).query({ q: '300 123' }).set(auth(admin));
      expect(byPhone.body.customers[0].name).toBe('Juan Pérez');

      const svc = await http().get(api('/search')).query({ q: 'cort' }).set(auth(admin));
      expect(svc.body.services.map((s: { name: string }) => s.name)).toContain('Corte');

      const pro = await http().get(api('/search')).query({ q: 'ana' }).set(auth(carlosToken));
      expect(pro.body.customers).toEqual([]); // Ana no tiene citas con Carlos
      expect(pro.body.professionals).toEqual([]);

      await http().get(api('/search')).query({ q: 'j' }).set(auth(admin)).expect(400);
    });
  });
});
