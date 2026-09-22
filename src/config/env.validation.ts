import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  SWAGGER_ENABLED: bool,

  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool,
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => v || undefined),

  ENCRYPTION_KEY: z.string().optional(),

  /** URL pública de esta API (para armar URLs de archivos subidos). */
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  /** URL pública de la web (para volver desde la pasarela de pago). */
  WEB_URL: z.string().url().default('http://localhost:3000'),
  /** Nombre de la plataforma en correos y textos propios (no en los del negocio). */
  PLATFORM_NAME: z.string().min(1).default('FILO'),
  UPLOADS_DIR: z.string().default('uploads'),

  // Wompi: respaldo si el negocio no configuró sus llaves en el panel (modo un solo negocio).
  // Cobro de la suscripción de los negocios a la plataforma (cuenta de FILO, no la del negocio).
  PLATFORM_WOMPI_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  PLATFORM_WOMPI_PUBLIC_KEY: z.string().optional(),
  PLATFORM_WOMPI_PRIVATE_KEY: z.string().optional(),
  PLATFORM_WOMPI_INTEGRITY_SECRET: z.string().optional(),
  PLAN_MONTHLY_CENTS: z.coerce.number().int().positive().default(6_900_000),
  PLAN_YEARLY_CENTS: z.coerce.number().int().positive().default(69_000_000),
  TRIAL_DAYS: z.coerce.number().int().min(0).max(90).default(14),

  WOMPI_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  WOMPI_PUBLIC_KEY: z.string().optional(),
  WOMPI_PRIVATE_KEY: z.string().optional(),
  WOMPI_INTEGRITY_SECRET: z.string().optional(),
  WOMPI_EVENTS_SECRET: z.string().optional(),

  // Correo (SMTP). Sin SMTP_HOST, no se envían correos.
  SMTP_HOST: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  SMTP_PASS: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  MAIL_FROM: z.string().default('FILO <no-reply@filo.local>'),

  /** Recordatorios automáticos (requieren un canal hacia el cliente: email/WhatsApp/SMS). */
  REMINDERS_ENABLED: bool,
});

export type Env = z.infer<typeof envSchema>;

/** Usado por ConfigModule: falla al arrancar si falta algo, con un mensaje claro. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return parsed.data;
}
