import { z } from 'zod';

/**
 * Qué ve un profesional cuando entra con su cuenta. Por defecto, lo suyo y nada más:
 * su agenda, sus clientes y su horario. El dueño puede abrirle más desde el panel.
 */
export const professionalAccessSchema = z.object({
  /** 'own' = solo sus citas · 'all' = la agenda completa del negocio */
  agenda: z.enum(['own', 'all']).default('own'),
  /** Ver la lista completa de clientes (si no, solo los que ha atendido) */
  clients: z.boolean().default(false),
  /** Leer y responder los mensajes del negocio */
  messages: z.boolean().default(false),
  /** Ver los reportes de ingresos y servicios */
  reports: z.boolean().default(false),
});

export type ProfessionalAccess = z.infer<typeof professionalAccessSchema>;

export const parseAccess = (raw: unknown): ProfessionalAccess =>
  professionalAccessSchema.parse(raw && typeof raw === 'object' ? raw : {});
