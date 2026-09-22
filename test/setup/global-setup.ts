/**
 * Prepara una base de datos exclusiva para tests (nunca la de desarrollo):
 *   - usa TEST_DATABASE_URL, o DATABASE_URL con el nombre de la base + "_test"
 *   - la crea si no existe y aplica las migraciones
 */
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export default async function globalSetup() {
  const envFile = resolve(__dirname, '../../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const base = process.env.DATABASE_URL;
  if (!base && !process.env.TEST_DATABASE_URL)
    throw new Error('Falta DATABASE_URL o TEST_DATABASE_URL');

  const testUrl = new URL(process.env.TEST_DATABASE_URL ?? base!);
  if (!process.env.TEST_DATABASE_URL) testUrl.pathname = `${testUrl.pathname}_test`;
  const dbName = testUrl.pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Por seguridad, la base de tests debe terminar en "_test" (recibido: ${dbName})`,
    );
  }

  // Conexión a la base "postgres" para crear la de tests si hace falta.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  const exists = await admin.$queryRaw<
    unknown[]
  >`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await admin.$disconnect();

  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: 'ignore',
  });

  process.env.DATABASE_URL = testUrl.toString();
  process.env.NODE_ENV = 'test';
}
