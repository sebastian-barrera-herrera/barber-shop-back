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

describe('Profesionales y clientes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Awaited<ReturnType<typeof createScheduleFixture>>;
  let owner: string;
  let admin: string;
  let carlosToken: string;
  const MONDAY = nextMonday();
  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    const a = await createBusiness(prisma, 'alpha');
    fx = await createScheduleFixture(prisma, a.business.id, a.professional.id);
    owner = (await login(app, 'owner@alpha.test')).token;
    admin = (await login(app, 'admin@alpha.test')).token;
    carlosToken = (await login(app, 'professional@alpha.test')).token;
  });

  afterAll(() => app.close());

  describe('profesionales', () => {
    let lauraId: string;

    it('agregar profesional con servicios, especialidades y redes', async () => {
      const res = await http()
        .post(api('/professionals'))
        .set(auth(admin))
        .send({
          name: 'Laura',
          title: 'Estilista',
          specialties: ['Color', ' Cepillado '],
          social: { instagram: 'https://instagram.com/laura' },
          serviceIds: [fx.color.id],
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        slug: 'laura',
        specialties: ['Color', 'Cepillado'],
        services: [{ name: 'Color' }],
        account: null,
      });
      expect(res.body.workingHours).toHaveLength(7);
      lauraId = res.body.id;
    });

    it('definir horario semanal con pausa; valida franjas cruzadas', async () => {
      const ok = await http()
        .put(api(`/professionals/${lauraId}/working-hours`))
        .set(auth(admin))
        .send({
          days: [
            {
              weekday: 1,
              ranges: [
                { start: '14:00', end: '18:00' },
                { start: '09:00', end: '13:00' },
              ],
            },
          ],
        });
      expect(ok.status).toBe(200);
      expect(ok.body[1].ranges).toEqual([
        { start: '09:00', end: '13:00' },
        { start: '14:00', end: '18:00' },
      ]);
      expect(ok.body[3].ranges).toEqual([]);

      const bad = await http()
        .put(api(`/professionals/${lauraId}/working-hours`))
        .set(auth(admin))
        .send({
          days: [
            {
              weekday: 1,
              ranges: [
                { start: '09:00', end: '13:00' },
                { start: '12:00', end: '15:00' },
              ],
            },
          ],
        });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toBe('Las franjas de un mismo día no pueden cruzarse');
    });

    it('el profesional edita su propio horario, pero no el de otros', async () => {
      await http()
        .put(api(`/professionals/${fx.carlos.id}/working-hours`))
        .set(auth(carlosToken))
        .send({
          days: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            ranges: [
              { start: '09:00', end: '13:00' },
              { start: '14:00', end: '18:00' },
            ],
          })),
        })
        .expect(200);
      await http()
        .put(api(`/professionals/${lauraId}/working-hours`))
        .set(auth(carlosToken))
        .send({ days: [] })
        .expect(403);
      await http()
        .patch(api(`/professionals/${fx.carlos.id}`))
        .set(auth(carlosToken))
        .send({ bio: 'x' })
        .expect(403);
    });

    it('asignar servicios reemplaza la lista y valida que sean del negocio', async () => {
      const res = await http()
        .put(api(`/professionals/${lauraId}/services`))
        .set(auth(owner))
        .send({ serviceIds: [fx.corte.id, fx.color.id] });
      expect(res.body.services.map((s: { name: string }) => s.name).sort()).toEqual([
        'Color',
        'Corte',
      ]);

      await http()
        .put(api(`/professionals/${lauraId}/services`))
        .set(auth(owner))
        .send({ serviceIds: ['00000000-0000-4000-8000-000000000000'] })
        .expect(400);
    });

    it('equipo público filtrado por servicio', async () => {
      const res = await http()
        .get(api('/public/alpha/professionals'))
        .query({ serviceId: fx.color.id });
      expect(res.status).toBe(200);
      expect(res.body.map((p: { name: string }) => p.name).sort()).toEqual(['Carlos', 'Laura']);
      expect(res.body[0].userId).toBeUndefined();
    });

    it('crear usuario para el profesional (solo el dueño) y que pueda entrar', async () => {
      await http()
        .post(api(`/professionals/${lauraId}/account`))
        .set(auth(admin))
        .send({ email: 'laura@alpha.test', password: 'laura-clave-123' })
        .expect(403);
      const res = await http()
        .post(api(`/professionals/${lauraId}/account`))
        .set(auth(owner))
        .send({ email: 'Laura@Alpha.test', password: 'laura-clave-123' });
      expect(res.status).toBe(201);
      expect(res.body.account).toEqual({ email: 'laura@alpha.test', isActive: true });

      const session = await login(app, 'laura@alpha.test', 'laura-clave-123');
      expect(session.res.body.user).toMatchObject({
        role: 'PROFESSIONAL',
        professionalId: lauraId,
      });
    });

    it('no se elimina un profesional con citas próximas; sin citas sí (y se desactiva su usuario)', async () => {
      await prisma.appointment.create({
        data: {
          businessId: fx.carlos.businessId,
          customerId: (
            await prisma.customer.create({
              data: { businessId: fx.carlos.businessId, name: 'Temp', phone: '+573009990000' },
            })
          ).id,
          professionalId: fx.carlos.id,
          serviceId: fx.corte.id,
          startsAt: new Date(localIso(MONDAY, '09:00')),
          endsAt: new Date(localIso(MONDAY, '09:30')),
          serviceNameSnapshot: 'Corte',
          priceCents: 3_500_000,
          durationMinutes: 30,
        },
      });
      const blocked = await http()
        .delete(api(`/professionals/${fx.carlos.id}`))
        .set(auth(owner));
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toContain('tiene 1 cita(s) próxima(s)');

      await http()
        .delete(api(`/professionals/${lauraId}`))
        .set(auth(owner))
        .expect(204);
      await http()
        .get(api(`/professionals/${lauraId}`))
        .set(auth(owner))
        .expect(404);
      const { res } = await login(app, 'laura@alpha.test', 'laura-clave-123');
      expect(res.status).toBe(401);
    });
  });

  describe('clientes', () => {
    let customerId: string;

    it('agregar cliente normaliza el teléfono y evita duplicados', async () => {
      const res = await http()
        .post(api('/customers'))
        .set(auth(admin))
        .send({
          name: 'Juan Pérez',
          phone: '(300) 123-4567',
          email: 'JUAN@correo.com',
          notes: 'Alérgico a la cera',
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ phone: '+573001234567', email: 'juan@correo.com' });
      customerId = res.body.id;

      const dup = await http()
        .post(api('/customers'))
        .set(auth(admin))
        .send({ name: 'Otro', phone: '3001234567' });
      expect(dup.status).toBe(409);
      expect(dup.body.message).toBe('Ya hay un cliente con ese teléfono: Juan Pérez');
    });

    it('lista con número de citas y última cita; búsqueda por nombre y teléfono', async () => {
      await prisma.appointment.create({
        data: {
          businessId: fx.carlos.businessId,
          customerId,
          professionalId: fx.maria.id,
          serviceId: fx.corte.id,
          startsAt: new Date(Date.now() - 7 * 86_400_000),
          endsAt: new Date(Date.now() - 7 * 86_400_000 + 1_800_000),
          status: 'COMPLETED',
          serviceNameSnapshot: 'Corte',
          priceCents: 3_500_000,
          durationMinutes: 30,
        },
      });
      const byName = await http().get(api('/customers')).set(auth(owner)).query({ q: 'juan' });
      expect(byName.body.items).toHaveLength(1);
      expect(byName.body.items[0]).toMatchObject({
        appointmentsCount: 1,
        lastAppointmentAt: expect.any(String),
      });

      const byPhone = await http().get(api('/customers')).set(auth(owner)).query({ q: '123 45' });
      expect(byPhone.body.items[0].id).toBe(customerId);
    });

    it('ficha con resumen: visitas, gastado y próxima cita', async () => {
      const res = await http()
        .get(api(`/customers/${customerId}`))
        .set(auth(owner));
      expect(res.body.stats).toMatchObject({
        appointments: 1,
        completed: 1,
        totalSpentCents: 3_500_000,
      });
      expect(res.body.nextAppointment).toBeNull();

      const history = await http()
        .get(api(`/customers/${customerId}/appointments`))
        .set(auth(owner));
      expect(history.body.items).toHaveLength(1);
    });

    it('el profesional solo ve clientes que han reservado con él', async () => {
      const list = await http().get(api('/customers')).set(auth(carlosToken));
      expect(list.body.items.map((c: { name: string }) => c.name)).toEqual(['Temp']);
      await http()
        .get(api(`/customers/${customerId}`))
        .set(auth(carlosToken))
        .expect(404);
      await http()
        .patch(api(`/customers/${customerId}`))
        .set(auth(carlosToken))
        .send({ notes: 'x' })
        .expect(403);
    });

    it('editar notas; no se elimina un cliente con citas', async () => {
      const res = await http()
        .patch(api(`/customers/${customerId}`))
        .set(auth(admin))
        .send({ notes: 'Prefiere tijera' });
      expect(res.body.notes).toBe('Prefiere tijera');
      await http()
        .delete(api(`/customers/${customerId}`))
        .set(auth(admin))
        .expect(409);

      const fresh = await http()
        .post(api('/customers'))
        .set(auth(admin))
        .send({ name: 'Nuevo', phone: '3150001111' });
      await http()
        .delete(api(`/customers/${fresh.body.id}`))
        .set(auth(admin))
        .expect(204);
    });
  });
});
