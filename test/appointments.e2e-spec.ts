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
} from './setup/test-app';

describe('Disponibilidad y citas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Awaited<ReturnType<typeof createScheduleFixture>>;
  let owner: string;
  let carlosToken: string;
  let ownerB: string;
  const MONDAY = nextMonday();
  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const slotsFor = async (query: Record<string, string>) => {
    const res = await http()
      .get(api('/public/alpha/availability'))
      .query({ date: MONDAY, ...query });
    expect(res.status).toBe(200);
    return res.body.slots as { time: string; startsAt: string; professionalIds: string[] }[];
  };

  const book = (body: Record<string, unknown>) =>
    http()
      .post(api('/public/alpha/appointments'))
      .send({ customer: { name: 'Juan Pérez', phone: '300 123 4567' }, ...body });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    const a = await createBusiness(prisma, 'alpha');
    await createBusiness(prisma, 'beta');
    fx = await createScheduleFixture(prisma, a.business.id, a.professional.id);
    owner = (await login(app, 'owner@alpha.test')).token;
    carlosToken = (await login(app, 'professional@alpha.test')).token;
    ownerB = (await login(app, 'owner@beta.test')).token;
  });

  afterAll(() => app.close());

  describe('disponibilidad pública', () => {
    it('lista horas cada 15 min respetando la pausa de almuerzo', async () => {
      const slots = await slotsFor({ serviceId: fx.corte.id, professionalId: fx.carlos.id });
      const times = slots.map((s) => s.time);
      expect(times[0]).toBe('09:00');
      expect(times).toContain('12:30');
      expect(times).not.toContain('12:45'); // 12:45–13:15 invade el almuerzo
      expect(times).not.toContain('13:00');
      expect(times).toContain('14:00');
      expect(times[times.length - 1]).toBe('17:30');
    });

    it('"cualquier profesional" une horas e indica quién está libre', async () => {
      const slots = await slotsFor({ serviceId: fx.corte.id });
      expect(slots.find((s) => s.time === '09:00')!.professionalIds).toEqual([fx.carlos.id]);
      expect(slots.find((s) => s.time === '10:00')!.professionalIds.sort()).toEqual(
        [fx.carlos.id, fx.maria.id].sort(),
      );
    });

    it('rechaza un profesional que no hace el servicio', async () => {
      await http()
        .get(api('/public/alpha/availability'))
        .query({ serviceId: fx.color.id, professionalId: fx.maria.id, date: MONDAY })
        .expect(400);
    });

    it('domingo (negocio cerrado): sin horas; fecha inválida: 400', async () => {
      const sunday = new Date(`${MONDAY}T12:00:00Z`);
      sunday.setUTCDate(sunday.getUTCDate() - 1);
      const res = await http()
        .get(api('/public/alpha/availability'))
        .query({ serviceId: fx.corte.id, date: sunday.toISOString().slice(0, 10) });
      expect(res.body.slots).toEqual([]);
      await http()
        .get(api('/public/alpha/availability'))
        .query({ serviceId: fx.corte.id, date: '2026-02-30' })
        .expect(400);
    });

    it('días con cupo en un rango', async () => {
      const res = await http()
        .get(api('/public/alpha/availability/days'))
        .query({ serviceId: fx.corte.id, from: MONDAY, to: MONDAY });
      expect(res.body).toEqual([{ date: MONDAY, available: true, slots: expect.any(Number) }]);
    });
  });

  describe('reserva pública', () => {
    let token: string;

    it('reserva sin cuenta: crea la cita pendiente, el cliente y el enlace privado', async () => {
      const res = await book({
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, '10:00'),
      });
      expect(res.status).toBe(201);
      expect(res.body.appointment).toMatchObject({
        status: 'PENDING',
        serviceName: 'Corte',
        priceCents: 3_500_000,
        durationMinutes: 30,
        professional: { name: 'Carlos' },
        canCancel: true,
      });
      expect(res.body.manageToken).toHaveLength(43);
      token = res.body.manageToken;

      const customer = await prisma.customer.findFirst({ where: { phone: '+573001234567' } });
      expect(customer?.name).toBe('Juan Pérez');
    });

    it('la hora ocupada deja de aparecer (y las que se cruzan)', async () => {
      const times = (await slotsFor({ serviceId: fx.corte.id, professionalId: fx.carlos.id })).map(
        (s) => s.time,
      );
      expect(times).not.toContain('09:45');
      expect(times).not.toContain('10:00');
      expect(times).not.toContain('10:15');
      expect(times).toContain('09:30');
      expect(times).toContain('10:30');
    });

    it('reservar una hora ocupada devuelve un mensaje claro', async () => {
      const res = await book({
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, '10:15'),
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Esa hora ya está ocupada. Elige otra');
    });

    it('el mismo teléfono en otro formato reutiliza al cliente', async () => {
      const res = await book({
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, '15:00'),
        customer: { name: 'Juancho', phone: '+57 (300) 123-4567', email: 'juan@correo.com' },
      });
      expect(res.status).toBe(201);
      const customers = await prisma.customer.findMany({ where: { phone: '+573001234567' } });
      expect(customers).toHaveLength(1);
      expect(customers[0]).toMatchObject({ name: 'Juan Pérez', email: 'juan@correo.com' });
    });

    it('"me da igual": asigna al profesional libre', async () => {
      const res = await book({
        serviceId: fx.corte.id,
        startsAt: localIso(MONDAY, '10:00'),
        customer: { name: 'Ana', phone: '3109876543' },
      });
      expect(res.status).toBe(201);
      expect(res.body.appointment.professional.name).toBe('María');
    });

    it('rechaza horas fuera de la cuadrícula, teléfonos inválidos y campos extra', async () => {
      const offGrid = await book({
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, '11:05'),
      });
      expect(offGrid.status).toBe(400);
      expect(offGrid.body.message).toBe('Elige una de las horas disponibles');

      const badPhone = await book({
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, '11:00'),
        customer: { name: 'X Y', phone: '1234567' },
      });
      expect(badPhone.status).toBe(400);

      const extra = await book({
        serviceId: fx.corte.id,
        startsAt: localIso(MONDAY, '11:00'),
        priceCents: 1,
      });
      expect(extra.status).toBe(400);
    });

    it('concurrencia: 6 reservas simultáneas de la misma hora → solo una gana', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          book({
            serviceId: fx.corte.id,
            professionalId: fx.carlos.id,
            startsAt: localIso(MONDAY, '16:00'),
            customer: { name: `Cliente ${i}`, phone: `31000000${10 + i}` },
          }),
        ),
      );
      const statuses = attempts.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.every((s) => [201, 400, 409].includes(s))).toBe(true);
      const count = await prisma.appointment.count({
        where: {
          professionalId: fx.carlos.id,
          startsAt: new Date(localIso(MONDAY, '16:00')),
          status: { not: 'CANCELLED' },
        },
      });
      expect(count).toBe(1);
    });

    it('el cliente ve y cancela su cita con el enlace; la hora vuelve a quedar libre', async () => {
      const view = await http().get(api(`/public/alpha/appointments/by-token/${token}`));
      expect(view.status).toBe(200);
      expect(view.body).toMatchObject({ status: 'PENDING', customer: { name: 'Juan Pérez' } });

      const cancel = await http()
        .post(api(`/public/alpha/appointments/by-token/${token}/cancel`))
        .send({});
      expect(cancel.status).toBe(200);
      expect(cancel.body).toMatchObject({ status: 'CANCELLED', canCancel: false });

      await http()
        .post(api(`/public/alpha/appointments/by-token/${token}/cancel`))
        .send({})
        .expect(400);
      const times = (await slotsFor({ serviceId: fx.corte.id, professionalId: fx.carlos.id })).map(
        (s) => s.time,
      );
      expect(times).toContain('10:00');
    });

    it('un enlace de otro negocio o inventado no funciona', async () => {
      await http()
        .get(api(`/public/beta/appointments/by-token/${token}`))
        .expect(404);
      await http().get(api('/public/alpha/appointments/by-token/inventado')).expect(404);
    });
  });

  describe('bloqueos de horario', () => {
    it('bloquear 11:00–12:00 quita esas horas y avisa si hay citas dentro', async () => {
      const res = await http()
        .post(api('/time-off'))
        .set(auth(owner))
        .send({
          professionalId: fx.carlos.id,
          startsAt: localIso(MONDAY, '11:00'),
          endsAt: localIso(MONDAY, '12:00'),
          reason: 'Médico',
        });
      expect(res.status).toBe(201);
      expect(res.body.conflictingAppointments).toBe(0);

      const times = (await slotsFor({ serviceId: fx.corte.id, professionalId: fx.carlos.id })).map(
        (s) => s.time,
      );
      expect(times).not.toContain('11:00');
      expect(times).not.toContain('11:45');
      expect(times).toContain('10:30');
      expect(times).toContain('12:00');
    });

    it('un cierre del negocio afecta a todos; el profesional no puede crear cierres generales', async () => {
      await http()
        .post(api('/time-off'))
        .set(auth(owner))
        .send({
          professionalId: null,
          startsAt: localIso(MONDAY, '17:00'),
          endsAt: localIso(MONDAY, '18:00'),
        })
        .expect(201);
      const times = (await slotsFor({ serviceId: fx.corte.id })).map((s) => s.time);
      expect(times).not.toContain('17:00');

      await http()
        .post(api('/time-off'))
        .set(auth(carlosToken))
        .send({
          professionalId: fx.maria.id,
          startsAt: localIso(MONDAY, '12:00'),
          endsAt: localIso(MONDAY, '12:30'),
        })
        .expect(403);
      // Sin professionalId, el bloqueo del profesional es suyo
      const own = await http()
        .post(api('/time-off'))
        .set(auth(carlosToken))
        .send({ startsAt: localIso(MONDAY, '12:30'), endsAt: localIso(MONDAY, '13:00') });
      expect(own.status).toBe(201);
      expect(own.body.professionalId).toBe(fx.carlos.id);
    });
  });

  describe('panel', () => {
    let manualId: string;

    it('reserva manual a una hora fuera de la cuadrícula (14:05), confirmada por defecto', async () => {
      const res = await http()
        .post(api('/appointments'))
        .set(auth(owner))
        .send({
          serviceId: fx.corte.id,
          professionalId: fx.carlos.id,
          startsAt: localIso(MONDAY, '14:05'),
          customer: { name: 'Pedro Gómez', phone: '3201112233' },
          internalNotes: 'Cliente frecuente',
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'CONFIRMED',
        source: 'ADMIN',
        customer: { name: 'Pedro Gómez' },
      });
      expect(res.body.accessTokenHash).toBeUndefined();
      manualId = res.body.id;
    });

    it('fuera del horario: pide confirmación explícita; nunca permite cruces', async () => {
      const body = {
        serviceId: fx.corte.id,
        professionalId: fx.carlos.id,
        startsAt: localIso(MONDAY, '19:00'),
        customer: { name: 'Tarde', phone: '3205556677' },
      };
      const blocked = await http().post(api('/appointments')).set(auth(owner)).send(body);
      expect(blocked.status).toBe(400);
      expect(blocked.body.message).toBe('Esa hora está fuera del horario de atención');

      await http()
        .post(api('/appointments'))
        .set(auth(owner))
        .send({ ...body, allowOutsideHours: true })
        .expect(201);
      const clash = await http()
        .post(api('/appointments'))
        .set(auth(owner))
        .send({ ...body, startsAt: localIso(MONDAY, '19:15'), allowOutsideHours: true });
      expect(clash.status).toBe(409);
      expect(clash.body.message).toBe('Esa hora acaba de ocuparse. Elige otra');
    });

    it('mover una cita a una hora libre, y no encima de otra', async () => {
      const moved = await http()
        .patch(api(`/appointments/${manualId}`))
        .set(auth(owner))
        .send({ startsAt: localIso(MONDAY, '14:30') });
      expect(moved.status).toBe(200);
      expect(new Date(moved.body.endsAt).toISOString()).toBe(localIso(MONDAY, '15:00'));

      const onTop = await http()
        .patch(api(`/appointments/${manualId}`))
        .set(auth(owner))
        .send({ startsAt: localIso(MONDAY, '15:00') });
      expect(onTop.status).toBe(400);
    });

    it('cambiar a un servicio más largo revisa que quepa; si cabe, actualiza precio y duración', async () => {
      // 14:30 + 60 min chocaría con la cita de las 15:00
      const clash = await http()
        .patch(api(`/appointments/${manualId}`))
        .set(auth(owner))
        .send({ serviceId: fx.color.id });
      expect(clash.status).toBe(400);

      const res = await http()
        .patch(api(`/appointments/${manualId}`))
        .set(auth(owner))
        .send({ serviceId: fx.color.id, startsAt: localIso(MONDAY, '14:00') });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        serviceNameSnapshot: 'Color',
        priceCents: 12_000_000,
        durationMinutes: 60,
      });
      expect(new Date(res.body.endsAt).toISOString()).toBe(localIso(MONDAY, '15:00'));
    });

    it('recorrido de estados y transiciones inválidas', async () => {
      const step = (status: string) =>
        http()
          .post(api(`/appointments/${manualId}/status`))
          .set(auth(owner))
          .send({ status });
      expect((await step('IN_PROGRESS')).body.status).toBe('IN_PROGRESS');
      expect((await step('COMPLETED')).body.status).toBe('COMPLETED');
      const back = await step('PENDING');
      expect(back.status).toBe(400);
      expect(back.body.message).toBe('Una cita "Completada" no puede pasar a "Pendiente"');

      const move = await http()
        .patch(api(`/appointments/${manualId}`))
        .set(auth(owner))
        .send({ startsAt: localIso(MONDAY, '09:00') });
      expect(move.status).toBe(400);
    });

    it('filtros: fecha, estado, profesional y búsqueda', async () => {
      const day = { from: localIso(MONDAY, '00:00'), to: localIso(MONDAY, '23:59') };
      const all = await http().get(api('/appointments')).set(auth(owner)).query(day);
      expect(all.body.total).toBeGreaterThanOrEqual(5);

      const cancelled = await http()
        .get(api('/appointments'))
        .set(auth(owner))
        .query({ ...day, status: 'CANCELLED' });
      expect(cancelled.body.items.every((a: { status: string }) => a.status === 'CANCELLED')).toBe(
        true,
      );

      const maria = await http()
        .get(api('/appointments'))
        .set(auth(owner))
        .query({ ...day, professionalId: fx.maria.id });
      expect(maria.body.items.map((a: { customer: { name: string } }) => a.customer.name)).toEqual([
        'Ana',
      ]);

      const search = await http().get(api('/appointments')).set(auth(owner)).query({ q: 'pedro' });
      expect(search.body.items).toHaveLength(1);
    });

    it('el profesional solo ve y gestiona sus propias citas', async () => {
      const mine = await http().get(api('/appointments')).set(auth(carlosToken));
      expect(
        mine.body.items.every(
          (a: { professional: { id: string } }) => a.professional.id === fx.carlos.id,
        ),
      ).toBe(true);

      // intentar filtrar por otra profesional no amplía su alcance
      const sneaky = await http()
        .get(api('/appointments'))
        .set(auth(carlosToken))
        .query({ professionalId: fx.maria.id });
      expect(
        sneaky.body.items.every(
          (a: { professional: { id: string } }) => a.professional.id === fx.carlos.id,
        ),
      ).toBe(true);

      const anaAppt = await prisma.appointment.findFirstOrThrow({
        where: { professionalId: fx.maria.id },
      });
      await http()
        .get(api(`/appointments/${anaAppt.id}`))
        .set(auth(carlosToken))
        .expect(404);
      await http()
        .post(api(`/appointments/${anaAppt.id}/status`))
        .set(auth(carlosToken))
        .send({ status: 'CONFIRMED' })
        .expect(404);

      const own = await prisma.appointment.findFirstOrThrow({
        where: { professionalId: fx.carlos.id, status: 'PENDING' },
      });
      const confirm = await http()
        .post(api(`/appointments/${own.id}/status`))
        .set(auth(carlosToken))
        .send({ status: 'CONFIRMED' });
      expect(confirm.body.status).toBe('CONFIRMED');

      await http()
        .post(api('/appointments'))
        .set(auth(carlosToken))
        .send({
          serviceId: fx.corte.id,
          professionalId: fx.carlos.id,
          startsAt: localIso(MONDAY, '09:00'),
          customer: { name: 'A B', phone: '3001112222' },
        })
        .expect(403);
    });

    it('aislamiento: otro negocio no ve las citas', async () => {
      await http()
        .get(api(`/appointments/${manualId}`))
        .set(auth(ownerB))
        .expect(404);
      const list = await http().get(api('/appointments')).set(auth(ownerB));
      expect(list.body.total).toBe(0);
    });
  });
});
