import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { api, createBusiness, createTestApp, login, resetDatabase } from './setup/test-app';

describe('Suscripción del negocio con la plataforma (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: string;
  let businessId: string;
  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    const a = await createBusiness(prisma, 'alpha');
    businessId = a.business.id;
    owner = (await login(app, 'owner@alpha.test')).token;
  });
  afterAll(() => app.close());

  it('muestra el plan, los días de prueba y el precio', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { trialEndsAt: new Date(Date.now() + 10 * 86_400_000) },
    });
    const res = await http().get(api('/subscription')).set(auth(owner)).expect(200);
    expect(res.body).toMatchObject({
      subscriptionStatus: 'TRIALING',
      daysLeft: 10,
      prices: { MONTHLY: 6_900_000, YEARLY: 69_000_000 },
      canPayOnline: false, // sin llaves de la plataforma en los tests
      payments: [],
    });
  });

  it('sin llaves de la plataforma, el cobro en línea avisa en vez de romperse', async () => {
    const res = await http()
      .post(api('/subscription/checkout'))
      .set(auth(owner))
      .send({ plan: 'MONTHLY' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Escríbenos/);
  });

  it('solo el dueño ve la suscripción', async () => {
    const admin = (await login(app, 'admin@alpha.test')).token;
    await http().get(api('/subscription')).set(auth(admin)).expect(403);
  });

  it('con la prueba vencida el panel queda de solo lectura, pero la web sigue reservando', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { trialEndsAt: new Date(Date.now() - 86_400_000) },
    });

    // Leer sí; escribir no.
    await http().get(api('/services')).set(auth(owner)).expect(200);
    const blocked = await http()
      .post(api('/categories'))
      .set(auth(owner))
      .send({ name: 'Nueva categoría' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/prueba terminó/);

    // La página pública del negocio no se apaga.
    await http().get(api('/public/alpha/business')).expect(200);
  });
});
