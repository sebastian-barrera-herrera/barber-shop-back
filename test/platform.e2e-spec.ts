import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  api,
  createBusiness,
  createTestApp,
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

describe('Plataforma: registro de empresas y contraseñas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mails: CapturedMail[];
  const http = () => request(app.getHttpServer());

  const barberia = {
    businessName: 'Barbería El Bigote',
    slug: 'el-bigote',
    style: 'BARBER',
    ownerName: 'Andrés Gómez',
    email: 'andres@elbigote.co',
    password: 'bigote-2026',
    phone: '300 123 4567',
    city: 'Medellín',
  };

  beforeAll(async () => {
    ({ app, prisma, mails } = await createTestApp());
    await resetDatabase(prisma);
    await createBusiness(prisma, 'alpha');
  });
  beforeEach(() => mails.splice(0));
  afterAll(() => app.close());

  describe('dirección de la página', () => {
    it('sugiere una dirección a partir del nombre', async () => {
      const res = await http().get(api('/platform/slug')).query({ name: 'Spa Luna Llena' });
      expect(res.body).toMatchObject({ slug: 'spa-luna-llena', available: true });
    });

    it('una dirección tomada o reservada no está libre y propone otra', async () => {
      const taken = await http().get(api('/platform/slug')).query({ slug: 'alpha' });
      expect(taken.body).toMatchObject({ available: false, suggestion: 'alpha-2' });
      expect(taken.body.reason).toMatch(/otro negocio/);

      const reserved = await http().get(api('/platform/slug')).query({ slug: 'admin' });
      expect(reserved.body.available).toBe(false);
      expect(reserved.body.reason).toMatch(/reservada/);

      const bad = await http().get(api('/platform/slug')).query({ slug: '-mal-' });
      expect(bad.body.available).toBe(false);
    });
  });

  describe('registro', () => {
    let token: string;

    it('crea la empresa con su estilo, abre sesión y deja la página lista para reservar', async () => {
      const res = await http().post(api('/platform/register')).send(barberia);
      expect(res.status).toBe(201);
      expect(res.body.business).toEqual({ slug: 'el-bigote', style: 'BARBER' });
      expect(res.body.user).toMatchObject({ role: 'OWNER', email: 'andres@elbigote.co' });
      expect(res.headers['set-cookie']?.[0]).toMatch(/^sb_rt=.*HttpOnly/);
      token = res.body.accessToken;

      const profile = await http().get(api('/public/el-bigote/business')).expect(200);
      expect(profile.body).toMatchObject({
        name: 'Barbería El Bigote',
        style: 'BARBER',
        type: 'BARBERSHOP',
        whatsapp: '+573001234567',
        branding: { preset: 'clasico' },
      });

      // Carta de ejemplo y el dueño como profesional con horario: se puede reservar ya.
      const services = await http().get(api('/public/el-bigote/services')).expect(200);
      expect(JSON.stringify(services.body)).toContain('Fade');
      const pros = await http().get(api('/public/el-bigote/professionals')).expect(200);
      expect(pros.body[0]).toMatchObject({ name: 'Andrés Gómez', title: 'Barbero' });

      await waitForMail(mails, 1);
      expect(mails[0].to).toBe('andres@elbigote.co');
      expect(mails[0].subject).toMatch(/^Bienvenido a FILO/);
      expect(mails[0].text).toContain('/el-bigote');
    });

    it('el panel de la empresa nueva solo ve sus datos', async () => {
      const res = await http()
        .get(api('/business'))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toMatchObject({ slug: 'el-bigote', style: 'BARBER' });
      const customers = await http()
        .get(api('/customers'))
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(customers.body.total ?? customers.body.length).toBe(0);
    });

    it('un spa arranca con el estilo y la carta de spa', async () => {
      const res = await http()
        .post(api('/platform/register'))
        .send({
          ...barberia,
          businessName: 'Spa Luna',
          slug: 'spa-luna',
          style: 'SPA',
          email: 'hola@spaluna.co',
          phone: undefined,
        });
      expect(res.status).toBe(201);
      const profile = await http().get(api('/public/spa-luna/business')).expect(200);
      expect(profile.body).toMatchObject({
        style: 'SPA',
        type: 'SPA',
        branding: { preset: 'spa' },
      });
    });

    it('rechaza correo repetido, dirección tomada o reservada y datos inválidos', async () => {
      const dupEmail = await http()
        .post(api('/platform/register'))
        .send({ ...barberia, slug: 'otra-direccion' });
      expect(dupEmail.status).toBe(409);
      expect(dupEmail.body.message).toMatch(/correo/);

      const dupSlug = await http()
        .post(api('/platform/register'))
        .send({ ...barberia, email: 'otro@correo.co' });
      expect(dupSlug.status).toBe(409);

      const reserved = await http()
        .post(api('/platform/register'))
        .send({ ...barberia, email: 'otro@correo.co', slug: 'registro' });
      expect(reserved.status).toBe(400);

      const invalid = await http()
        .post(api('/platform/register'))
        .send({ ...barberia, email: 'x', style: 'CIRCO', password: '123' });
      expect(invalid.status).toBe(400);

      expect(await prisma.business.count({ where: { slug: 'otra-direccion' } })).toBe(0);
    });
  });

  describe('olvidé mi contraseña', () => {
    it('responde igual si el correo no existe (no revela quién está registrado)', async () => {
      await http()
        .post(api('/auth/forgot-password'))
        .send({ email: 'nadie@correo.co' })
        .expect(204);
      await new Promise((r) => setTimeout(r, 150));
      expect(mails).toHaveLength(0);
    });

    it('envía un enlace de un solo uso que cambia la contraseña y cierra sesiones', async () => {
      const login = await http()
        .post(api('/auth/login'))
        .send({ email: barberia.email, password: barberia.password })
        .expect(200);
      const cookie = login.headers['set-cookie'];

      await http().post(api('/auth/forgot-password')).send({ email: barberia.email }).expect(204);
      await waitForMail(mails, 1);
      const link = mails[0].text.match(/https?:\/\/\S+\/restablecer\?token=(\S+)/);
      expect(link).not.toBeNull();
      const token = decodeURIComponent(link![1]);

      await http()
        .post(api('/auth/reset-password'))
        .send({ token, password: 'nueva-clave-99' })
        .expect(204);

      // La sesión anterior quedó cerrada; la contraseña vieja ya no sirve y la nueva sí.
      await http().post(api('/auth/refresh')).set('Cookie', cookie).expect(401);
      await http()
        .post(api('/auth/login'))
        .send({ email: barberia.email, password: barberia.password })
        .expect(401);
      await http()
        .post(api('/auth/login'))
        .send({ email: barberia.email, password: 'nueva-clave-99' })
        .expect(200);

      // El enlace no se puede reutilizar.
      const again = await http()
        .post(api('/auth/reset-password'))
        .send({ token, password: 'otra-clave-123' });
      expect(again.status).toBe(400);
    });
  });
});
