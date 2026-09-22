import { z } from 'zod';

/**
 * Forma de cada sección de BusinessSettings (columnas JSONB).
 * Siempre se lee con `.parse()` para completar valores por defecto:
 * un negocio recién creado funciona sin configurar nada.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido');

export const brandingSchema = z.object({
  preset: z.enum(['studio', 'barber', 'spa', 'nails', 'beauty']).default('studio'),
  primaryColor: hex.default('#141412'),
  secondaryColor: hex.default('#A8854A'),
  fontPreset: z.enum(['editorial', 'modern', 'classic']).default('editorial'),
  heroTitle: z.string().max(120).default('Tu próximo look empieza aquí.'),
  heroSubtitle: z.string().max(200).default('Reserva tu cita de forma rápida y sencilla.'),
  animations: z.boolean().default(true),
});

export const socialSchema = z.object({
  instagram: z.string().max(200).optional(),
  facebook: z.string().max(200).optional(),
  tiktok: z.string().max(200).optional(),
  whatsapp: z.string().max(30).optional(),
  website: z.string().max(200).optional(),
});

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:mm)');

export const openingDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  closed: z.boolean().default(false),
  open: time.default('09:00'),
  close: time.default('19:00'),
});

const DEFAULT_OPENING = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  closed: weekday === 0,
  open: '09:00',
  close: weekday === 6 ? '17:00' : '19:00',
}));

export const openingHoursSchema = z.array(openingDaySchema).length(7).default(DEFAULT_OPENING);

export const bookingSchema = z.object({
  slotStepMinutes: z
    .number()
    .int()
    .refine((v) => [5, 10, 15, 20, 30, 60].includes(v))
    .default(15),
  minAdvanceMinutes: z.number().int().min(0).max(10_080).default(60),
  maxAdvanceDays: z.number().int().min(1).max(365).default(30),
  cancellationWindowHours: z.number().int().min(0).max(168).default(4),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  autoConfirm: z.boolean().default(false),
  paymentMode: z.enum(['NONE', 'OPTIONAL', 'REQUIRED']).default('NONE'),
});

export type Branding = z.infer<typeof brandingSchema>;
export type Social = z.infer<typeof socialSchema>;
export type OpeningHours = z.infer<typeof openingHoursSchema>;
export type BookingRules = z.infer<typeof bookingSchema>;

export interface ParsedSettings {
  branding: Branding;
  social: Social;
  openingHours: OpeningHours;
  booking: BookingRules;
}

/** Lee la configuración guardada tolerando datos viejos o incompletos. */
export function parseSettings(
  raw?: {
    branding: unknown;
    social: unknown;
    openingHours: unknown;
    booking: unknown;
  } | null,
): ParsedSettings {
  const safe = <S extends z.ZodTypeAny>(
    schema: S,
    value: unknown,
    fallback: unknown,
  ): z.output<S> => {
    const r = schema.safeParse(value);
    return r.success ? r.data : schema.parse(fallback);
  };
  return {
    branding: safe(brandingSchema, raw?.branding ?? {}, {}),
    social: safe(socialSchema, raw?.social ?? {}, {}),
    openingHours: safe(openingHoursSchema, raw?.openingHours ?? undefined, undefined),
    booking: safe(bookingSchema, raw?.booking ?? {}, {}),
  };
}
