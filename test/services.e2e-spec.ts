import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { api, createBusiness, createTestApp, login, resetDatabase } from './setup/test-app';

describe('Categorías y servicios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerA: string;
  let adminA: string;
  let proA: string;
  let ownerB: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await createBusiness(prisma, 'alpha');
    await createBusiness(prisma, 'beta');
    ownerA = (await login(app, 'owner@alpha.test')).token;
    adminA = (await login(app, 'admin@alpha.test')).token;
    proA = (await login(app, 'professional@alpha.test')).token;
    ownerB = (await login(app, 'owner@beta.test')).token;
  });

  afterAll(() => app.close());

  let categoryId: string;
  let serviceId: string;

  it('el administrador crea una categoría con slug automático', async () => {
    const res = await http().post(api('/categories')).set(auth(adminA)).send({ name: 'Barbería' });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('barberia');
    categoryId = res.body.id;
  });

  it('crea un servicio y genera slugs únicos dentro del negocio', async () => {
    const body = { name: 'Corte clásico', priceCents: 3_500_000, durationMinutes: 45, categoryId };
    const a = await http().post(api('/services')).set(auth(adminA)).send(body);
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      slug: 'corte-clasico',
      priceCents: 3_500_000,
      category: { name: 'Barbería' },
    });
    serviceId = a.body.id;

    const dup = await http().post(api('/services')).set(auth(adminA)).send(body);
    expect(dup.body.slug).toBe('corte-clasico-2');

    // Otro negocio puede usar el mismo slug
    const other = await http()
      .post(api('/services'))
      .set(auth(ownerB))
      .send({ ...body, categoryId: undefined });
    expect(other.status).toBe(201);
    expect(other.body.slug).toBe('corte-clasico');
  });

  it('valida precio y duración', async () => {
    const res = await http()
      .post(api('/services'))
      .set(auth(adminA))
      .send({ name: 'X', priceCents: -5, durationMinutes: 2 });
    expect(res.status).toBe(400);
  });

  it('el profesional puede ver servicios pero no crearlos ni editarlos', async () => {
    await http().get(api('/services')).set(auth(proA)).expect(200);
    await http()
      .post(api('/services'))
      .set(auth(proA))
      .send({ name: 'Barba', priceCents: 2_500_000, durationMinutes: 30 })
      .expect(403);
    await http()
      .patch(api(`/services/${serviceId}`))
      .set(auth(proA))
      .send({ priceCents: 1 })
      .expect(403);
  });

  it('aislamiento: el negocio B no ve ni modifica servicios del negocio A', async () => {
    const list = await http().get(api('/services')).set(auth(ownerB));
    expect(list.body.map((s: { id: string }) => s.id)).not.toContain(serviceId);

    await http()
      .get(api(`/services/${serviceId}`))
      .set(auth(ownerB))
      .expect(404);
    await http()
      .patch(api(`/services/${serviceId}`))
      .set(auth(ownerB))
      .send({ priceCents: 1 })
      .expect(404);
    await http()
      .delete(api(`/services/${serviceId}`))
      .set(auth(ownerB))
      .expect(404);
  });

  it('no permite asignar una categoría de otro negocio', async () => {
    const res = await http()
      .post(api('/services'))
      .set(auth(ownerB))
      .send({ name: 'Intruso', priceCents: 100, durationMinutes: 30, categoryId });
    expect(res.status).toBe(400);
  });

  it('edita precio y duración; no permite dejar el nombre vacío', async () => {
    const res = await http()
      .patch(api(`/services/${serviceId}`))
      .set(auth(ownerA))
      .send({ priceCents: 4_000_000, durationMinutes: 50 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      priceCents: 4_000_000,
      durationMinutes: 50,
      slug: 'corte-clasico',
    });

    await http()
      .patch(api(`/services/${serviceId}`))
      .set(auth(ownerA))
      .send({ name: null })
      .expect(400);
  });

  it('catálogo público: muestra servicios activos agrupados, sin datos internos', async () => {
    await http()
      .post(api('/services'))
      .set(auth(adminA))
      .send({
        name: 'Servicio pausado',
        priceCents: 100,
        durationMinutes: 30,
        categoryId,
        isActive: false,
      });

    const res = await http().get(api('/public/alpha/catalog'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Barbería');
    const names = res.body[0].services.map((s: { name: string }) => s.name);
    expect(names).toContain('Corte clásico');
    expect(names).not.toContain('Servicio pausado');
    expect(res.body[0].services[0].businessId).toBeUndefined();

    const detail = await http().get(api('/public/alpha/services/corte-clasico'));
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ name: 'Corte clásico', professionals: [] });
  });

  it('negocio inexistente → 404', async () => {
    await http().get(api('/public/no-existe/catalog')).expect(404);
  });

  it('eliminar: desaparece del catálogo y libera el slug', async () => {
    await http()
      .delete(api(`/services/${serviceId}`))
      .set(auth(ownerA))
      .expect(204);
    await http().get(api('/public/alpha/services/corte-clasico')).expect(404);
    await http()
      .get(api(`/services/${serviceId}`))
      .set(auth(ownerA))
      .expect(404);

    const again = await http()
      .post(api('/services'))
      .set(auth(ownerA))
      .send({ name: 'Corte clásico', priceCents: 3_500_000, durationMinutes: 45 });
    expect(again.body.slug).toBe('corte-clasico');
  });

  it('borrar una categoría deja sus servicios "sin categoría"', async () => {
    await http()
      .delete(api(`/categories/${categoryId}`))
      .set(auth(ownerA))
      .expect(204);
    const res = await http().get(api('/public/alpha/catalog'));
    expect(res.body.map((g: { slug: string }) => g.slug)).toEqual(['otros']);
  });
});
