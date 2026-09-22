import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { api, createBusiness, createTestApp, login, resetDatabase } from './setup/test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    await createBusiness(prisma, 'alpha');
  });

  afterAll(() => app.close());

  const refreshCookie = (cookies: string[]) =>
    cookies.find((c) => c.startsWith('sb_rt='))!.split(';')[0];

  it('login correcto: devuelve access token y cookie httpOnly de refresh', async () => {
    const { res } = await login(app, 'owner@alpha.test');
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'owner@alpha.test', role: 'OWNER' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('sb_rt='),
    )!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('login incorrecto: 401 con mensaje genérico', async () => {
    const { res } = await login(app, 'owner@alpha.test', 'equivocada-999');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Correo o contraseña incorrectos');
  });

  it('valida el cuerpo del login y rechaza campos extra', async () => {
    const bad = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email: 'no-es-correo', password: '1' });
    expect(bad.status).toBe(400);

    const extra = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email: 'owner@alpha.test', password: 'clave-de-prueba-123', role: 'OWNER' });
    expect(extra.status).toBe(400);
  });

  it('rutas privadas exigen token', async () => {
    await request(app.getHttpServer()).get(api('/auth/me')).expect(401);
    await request(app.getHttpServer())
      .get(api('/auth/me'))
      .set('Authorization', 'Bearer basura')
      .expect(401);
  });

  it('GET /auth/me devuelve el usuario de la sesión', async () => {
    const { token } = await login(app, 'admin@alpha.test');
    const res = await request(app.getHttpServer())
      .get(api('/auth/me'))
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'admin@alpha.test', role: 'ADMIN' });
  });

  it('refresh rota la cookie; reutilizar la vieja cierra todas las sesiones', async () => {
    const { cookie } = await login(app, 'owner@alpha.test');
    const first = refreshCookie(cookie);

    const r1 = await request(app.getHttpServer()).post(api('/auth/refresh')).set('Cookie', first);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeTruthy();
    const second = refreshCookie(r1.headers['set-cookie'] as unknown as string[]);
    expect(second).not.toBe(first);

    // Reuso del token viejo → 401 y se revoca también el nuevo
    await request(app.getHttpServer()).post(api('/auth/refresh')).set('Cookie', first).expect(401);
    await request(app.getHttpServer()).post(api('/auth/refresh')).set('Cookie', second).expect(401);
  });

  it('logout revoca el refresh token', async () => {
    const { cookie } = await login(app, 'owner@alpha.test');
    const rt = refreshCookie(cookie);
    await request(app.getHttpServer()).post(api('/auth/logout')).set('Cookie', rt).expect(204);
    await request(app.getHttpServer()).post(api('/auth/refresh')).set('Cookie', rt).expect(401);
  });
});
