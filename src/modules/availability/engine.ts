/**
 * Motor de disponibilidad: lógica pura, sin base de datos.
 *
 * Horas libres = (horario del profesional ∩ horario del negocio)
 *                − bloqueos − citas activas (± margen entre citas)
 * y además: anticipación mínima, anticipación máxima y duración del servicio.
 */
import { addDays, toLocalDate, toLocalMinute, zonedToUtc } from '../../common/utils/time';

export interface Interval {
  /** epoch ms */
  start: number;
  end: number;
}

export interface MinuteRange {
  startMinute: number;
  endMinute: number;
}

export interface DayContext {
  /** fecha local 'YYYY-MM-DD' */
  date: string;
  timezone: string;
  durationMinutes: number;
  stepMinutes: number;
  bufferMinutes: number;
  /** horario del negocio ese día; null = cerrado */
  openingHours: MinuteRange | null;
  /** horario del profesional ese día (varias franjas = pausas) */
  workingRanges: MinuteRange[];
  /** citas activas y bloqueos del profesional (y del negocio) */
  busy: Interval[];
  now: Date;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
}

const MINUTE = 60_000;

/** Franjas de trabajo recortadas al horario del negocio, ordenadas y sin solapes. */
export function effectiveRanges(
  ctx: Pick<DayContext, 'openingHours' | 'workingRanges'>,
): MinuteRange[] {
  if (!ctx.openingHours) return [];
  const { startMinute: open, endMinute: close } = ctx.openingHours;
  const clipped = ctx.workingRanges
    .map((r) => ({
      startMinute: Math.max(r.startMinute, open),
      endMinute: Math.min(r.endMinute, close),
    }))
    .filter((r) => r.endMinute > r.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute);

  const merged: MinuteRange[] = [];
  for (const r of clipped) {
    const last = merged[merged.length - 1];
    if (last && r.startMinute <= last.endMinute)
      last.endMinute = Math.max(last.endMinute, r.endMinute);
    else merged.push({ ...r });
  }
  return merged;
}

/** ¿La fecha está dentro de la ventana de reserva (hoy … hoy + maxAdvanceDays)? */
export function withinBookingWindow(
  ctx: Pick<DayContext, 'date' | 'timezone' | 'now' | 'maxAdvanceDays'>,
): boolean {
  const today = toLocalDate(ctx.now, ctx.timezone);
  return ctx.date >= today && ctx.date <= addDays(today, ctx.maxAdvanceDays);
}

function overlapsBusy(start: number, end: number, busy: Interval[], bufferMs: number): boolean {
  return busy.some((b) => start < b.end + bufferMs && end > b.start - bufferMs);
}

/** Horas de inicio disponibles en el día, alineadas al paso configurado (ej. cada 15 min). */
export function computeSlots(ctx: DayContext): Date[] {
  if (!withinBookingWindow(ctx)) return [];

  const earliest = ctx.now.getTime() + ctx.minAdvanceMinutes * MINUTE;
  const durationMs = ctx.durationMinutes * MINUTE;
  const bufferMs = ctx.bufferMinutes * MINUTE;
  const slots: Date[] = [];

  for (const range of effectiveRanges(ctx)) {
    const first = Math.ceil(range.startMinute / ctx.stepMinutes) * ctx.stepMinutes;
    for (let m = first; m + ctx.durationMinutes <= range.endMinute; m += ctx.stepMinutes) {
      const start = zonedToUtc(ctx.date, m, ctx.timezone).getTime();
      if (start < earliest) continue;
      if (overlapsBusy(start, start + durationMs, ctx.busy, bufferMs)) continue;
      slots.push(new Date(start));
    }
  }
  return slots;
}

export type SlotCheck =
  | { ok: true }
  | { ok: false; reason: 'OUT_OF_WINDOW' | 'TOO_SOON' | 'OUTSIDE_HOURS' | 'OFF_GRID' | 'BUSY' };

/**
 * Verifica una hora concreta (al crear o mover una cita).
 * `requireGrid`: la web pública solo acepta horas del listado; el panel admite horas libres (10:05).
 */
export function checkSlot(ctx: DayContext, startsAt: Date, requireGrid: boolean): SlotCheck {
  if (toLocalDate(startsAt, ctx.timezone) !== ctx.date || !withinBookingWindow(ctx)) {
    return { ok: false, reason: 'OUT_OF_WINDOW' };
  }
  const start = startsAt.getTime();
  if (start < ctx.now.getTime() + ctx.minAdvanceMinutes * MINUTE)
    return { ok: false, reason: 'TOO_SOON' };

  const minute = toLocalMinute(startsAt, ctx.timezone);
  const inRange = effectiveRanges(ctx).some(
    (r) => minute >= r.startMinute && minute + ctx.durationMinutes <= r.endMinute,
  );
  if (!inRange) return { ok: false, reason: 'OUTSIDE_HOURS' };
  if (requireGrid && minute % ctx.stepMinutes !== 0) return { ok: false, reason: 'OFF_GRID' };

  const end = start + ctx.durationMinutes * MINUTE;
  if (overlapsBusy(start, end, ctx.busy, ctx.bufferMinutes * MINUTE))
    return { ok: false, reason: 'BUSY' };
  return { ok: true };
}
