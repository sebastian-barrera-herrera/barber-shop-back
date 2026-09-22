import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { hashPassword } from '../../src/modules/auth/password';
import { addDays, toLocalDate, weekdayOf, zonedToUtc } from '../../src/common/utils/time';
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

// ───────────── Agenda de prueba ─────────────

export const TZ = 'America/Bogota';

/** Próximo lunes (hora de Bogotá) con al menos 2 días de margen. */
export function nextMonday(): string {
  let date = addDays(toLocalDate(new Date(), TZ), 2);
  while (weekdayOf(date) !== 1) date = addDays(date, 1);
  return date;
}

/** ISO de una hora local en la fecha dada. */
export const localIso = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return zonedToUtc(date, h * 60 + m, TZ).toISOString();
};

/**
 * Carlos: corte (30') y color (60'), lun–sáb 9–13 y 14–18, vinculado al usuario PROFESSIONAL.
 * María: solo corte, lun–vie 10–16.
 */
export async function createScheduleFixture(
  prisma: PrismaService,
  businessId: string,
  professionalUserId?: string,
) {
  const category = await prisma.category.create({
    data: { businessId, name: 'Barbería', slug: 'barberia' },
  });
  const corte = await prisma.service.create({
    data: {
      businessId,
      categoryId: category.id,
      name: 'Corte',
      slug: 'corte',
      priceCents: 3_500_000,
      durationMinutes: 30,
    },
  });
  const color = await prisma.service.create({
    data: {
      businessId,
      categoryId: category.id,
      name: 'Color',
      slug: 'color',
      priceCents: 12_000_000,
      durationMinutes: 60,
    },
  });
  const days = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const carlos = await prisma.professional.create({
    data: {
      businessId,
      name: 'Carlos',
      slug: 'carlos',
      userId: professionalUserId,
      services: { create: [{ serviceId: corte.id }, { serviceId: color.id }] },
      workingHours: {
        create: days(1, 6).flatMap((weekday) => [
          { weekday, startMinute: 9 * 60, endMinute: 13 * 60 },
          { weekday, startMinute: 14 * 60, endMinute: 18 * 60 },
        ]),
      },
    },
  });
  const maria = await prisma.professional.create({
    data: {
      businessId,
      name: 'María',
      slug: 'maria',
      sortOrder: 1,
      services: { create: [{ serviceId: corte.id }] },
      workingHours: {
        create: days(1, 5).map((weekday) => ({
          weekday,
          startMinute: 10 * 60,
          endMinute: 16 * 60,
        })),
      },
    },
  });
  return { corte, color, carlos, maria };
}
