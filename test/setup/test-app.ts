import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { hashPassword } from '../../src/modules/auth/password';
import { PrismaService } from '../../src/prisma/prisma.service';
import { API_PREFIX, setupApp } from '../../src/setup-app';

export const PASSWORD = 'clave-de-prueba-123';

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Vacía las tablas de la base de tests (solo corre contra una base "_test"). */
export async function resetDatabase(prisma: PrismaService) {
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!db.endsWith('_test')) throw new Error(`resetDatabase se negó a correr sobre "${db}"`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}

/** Crea un negocio con un usuario por rol. */
export async function createBusiness(prisma: PrismaService, slug: string) {
  const passwordHash = await hashPassword(PASSWORD);
  const business = await prisma.business.create({ data: { slug, name: `Negocio ${slug}` } });
  const mk = (role: Role) =>
    prisma.user.create({
      data: {
        businessId: business.id,
        email: `${role.toLowerCase()}@${slug}.test`,
        passwordHash,
        name: role,
        role,
      },
    });
  const [owner, admin, professional] = await Promise.all([
    mk('OWNER'),
    mk('ADMIN'),
    mk('PROFESSIONAL'),
  ]);
  return { business, owner, admin, professional };
}

export async function login(app: INestApplication, email: string, password = PASSWORD) {
  const res = await request(app.getHttpServer())
    .post(`/${API_PREFIX}/auth/login`)
    .send({ email, password });
  return {
    token: res.body.accessToken as string,
    cookie: res.headers['set-cookie'] as unknown as string[],
    res,
  };
}

export const api = (path: string) => `/${API_PREFIX}${path}`;
