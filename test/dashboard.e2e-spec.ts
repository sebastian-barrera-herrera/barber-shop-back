import { INestApplication } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import request from 'supertest';
import { toLocalDate } from '../src/common/utils/time';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  api,
  createBusiness,
  createScheduleFixture,
  createTestApp,
  localIso,
  login,
  resetDatabase,
  TZ,
} from './setup/test-app';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: string;
  let carlosToken: string;
  const TODAY = toLocalDate(new Date(), TZ);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    const a = await createBusiness(prisma, 'alpha');
    const fx = await createScheduleFixture(prisma, a.business.id, a.professional.id);
    owner = (await login(app, 'owner@alpha.test')).token;
    carlosToken = (await login(app, 'professional@alpha.test')).token;

    const customer = await prisma.customer.create({
      data: { businessId: a.business.id, name: 'Cliente Hoy', phone: '+573001112233' },
    });
    const mk = (
      professionalId: string,
      hhmm: string,
      status: AppointmentStatus,
      priceCents = 3_500_000,
    ) =>
      prisma.appointment.create({
        data: {
          businessId: a.business.id,
          customerId: customer.id,
          professionalId,
          serviceId: fx.corte.id,
          startsAt: new Date(localIso(TODAY, hhmm)),
          endsAt: new Date(new Date(localIso(TODAY, hhmm)).getTime() + 30 * 60_000),
          status,
          serviceNameSnapshot: 'Corte',
          priceCents,
          durationMinutes: 30,
        },
      });
    await mk(fx.carlos.id, '09:00', 'COMPLETED');
    await mk(fx.carlos.id, '10:00', 'PENDING');
    await mk(fx.carlos.id, '11:00', 'CANCELLED');
    await mk(fx.maria.id, '10:00', 'CONFIRMED', 5_000_000);
  });

  afterAll(() => app.close());

  it('resumen del día para el dueño', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/dashboard/summary'))
      .set('Authorization', `Bearer ${owner}`);
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(TODAY);
    expect(res.body.today).toMatchObject({
      appointments: 3, // completada + pendiente + confirmada (la cancelada no cuenta)
      pending: 1,
      completed: 1,
      cancelled: 1,
      revenueCents: 3_500_000,
      expectedRevenueCents: 12_000_000,
      newCustomers: 1,
    });
    expect(res.body.activeProfessionals).toBe(2);
    expect(res.body.agenda).toHaveLength(3);
    expect(res.body.agenda[0].accessTokenHash).toBeUndefined();
    expect(res.body.revenueByDay).toHaveLength(7);
    expect(res.body.revenueByDay[6]).toEqual({
      date: TODAY,
      revenueCents: 3_500_000,
      appointments: 1,
    });
    expect(res.body.popularServices[0]).toMatchObject({ name: 'Corte', count: 3 });
  });

  it('el profesional ve solo sus números', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/dashboard/summary'))
      .set('Authorization', `Bearer ${carlosToken}`);
    expect(res.body.today).toMatchObject({
      appointments: 2,
      pending: 1,
      expectedRevenueCents: 7_000_000,
    });
    expect(
      res.body.agenda.every(
        (a: { professional: { name: string } }) => a.professional.name === 'Carlos',
      ),
    ).toBe(true);
  });

  it('valida la fecha', async () => {
    await request(app.getHttpServer())
      .get(api('/dashboard/summary'))
      .query({ date: '2026-13-01' })
      .set('Authorization', `Bearer ${owner}`)
      .expect(400);
  });
});
