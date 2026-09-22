import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  addDays,
  daysBetween,
  hhmmToMinutes,
  minutesToHhmm,
  toLocalDate,
  toLocalMinute,
  weekdayOf,
  zonedToUtc,
} from '../../common/utils/time';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_STATUSES } from '../appointments/status';
import { BusinessService } from '../business/business.service';
import { checkSlot, computeSlots, DayContext, Interval, SlotCheck } from './engine';

type Db = Prisma.TransactionClient | PrismaService;

export interface AvailabilityOptions {
  /** Panel: sin anticipación mínima/máxima */
  ignoreAdvance?: boolean;
  /** Al mover una cita, no contarla a ella misma como ocupada */
  excludeAppointmentId?: string;
  /** Incluir servicios pausados (reservas manuales desde el panel) */
  includeInactiveService?: boolean;
  now?: Date;
}

interface LoadedProfessional {
  id: string;
  name: string;
  sortOrder: number;
  workingHours: { weekday: number; startMinute: number; endMinute: number }[];
}

interface Context {
  timezone: string;
  settings: Awaited<ReturnType<BusinessService['getSchedulingContext']>>['settings'];
  service: { id: string; name: string; durationMinutes: number; priceCents: number };
  professionals: LoadedProfessional[];
}

export const SLOT_ERRORS: Record<Exclude<SlotCheck, { ok: true }>['reason'], string> = {
  OUT_OF_WINDOW: 'Esa fecha no está disponible para reservar',
  TOO_SOON: 'Esa hora ya no se puede reservar',
  OUTSIDE_HOURS: 'Esa hora está fuera del horario de atención',
  OFF_GRID: 'Elige una de las horas disponibles',
  BUSY: 'Esa hora ya está ocupada. Elige otra',
};

const MAX_RANGE_DAYS = 62;

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly business: BusinessService,
  ) {}

  /** Horas libres de un día. Sin profesional = "cualquiera": une las horas de todos. */
  async getDaySlots(
    businessId: string,
    req: { serviceId: string; professionalId?: string; date: string },
    opts: AvailabilityOptions = {},
  ) {
    const ctx = await this.loadContext(businessId, req.serviceId, req.professionalId, opts);
    const busy = await this.loadBusy(this.prisma, businessId, ctx, req.date, req.date, opts);
    const byTime = new Map<number, string[]>();

    for (const p of ctx.professionals) {
      for (const slot of computeSlots(
        this.dayContext(ctx, p, req.date, busy.get(p.id) ?? [], opts),
      )) {
        const key = slot.getTime();
        byTime.set(key, [...(byTime.get(key) ?? []), p.id]);
      }
    }

    const durationMs = ctx.service.durationMinutes * 60_000;
    return {
      date: req.date,
      timezone: ctx.timezone,
      durationMinutes: ctx.service.durationMinutes,
      slots: [...byTime.entries()]
        .sort(([a], [b]) => a - b)
        .map(([start, professionalIds]) => ({
          time: minutesToHhmm(toLocalMinute(new Date(start), ctx.timezone)),
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(start + durationMs).toISOString(),
          professionalIds,
        })),
    };
  }

  /** Qué días de un rango tienen al menos una hora libre (para atenuar días en el calendario). */
  async getDays(
    businessId: string,
    req: { serviceId: string; professionalId?: string; from: string; to: string },
    opts: AvailabilityOptions = {},
  ) {
    const span = daysBetween(req.from, req.to);
    if (span < 0) throw new BadRequestException('La fecha final debe ser posterior a la inicial');
    if (span > MAX_RANGE_DAYS)
      throw new BadRequestException(`Consulta máximo ${MAX_RANGE_DAYS} días`);

    const ctx = await this.loadContext(businessId, req.serviceId, req.professionalId, opts);
    const busy = await this.loadBusy(this.prisma, businessId, ctx, req.from, req.to, opts);

    return Array.from({ length: span + 1 }, (_, i) => {
      const date = addDays(req.from, i);
      const starts = new Set<number>();
      for (const p of ctx.professionals) {
        for (const s of computeSlots(this.dayContext(ctx, p, date, busy.get(p.id) ?? [], opts)))
          starts.add(s.getTime());
      }
      return { date, available: starts.size > 0, slots: starts.size };
    });
  }

  /**
   * Verifica una hora concreta antes de crear o mover una cita.
   * Sin profesional, elige al que tenga menos citas ese día (reparte la carga).
   */
  async resolveSlot(
    db: Db,
    businessId: string,
    req: { serviceId: string; professionalId?: string; startsAt: Date },
    opts: AvailabilityOptions & { requireGrid: boolean },
  ): Promise<{ professionalId: string; service: Context['service']; timezone: string }> {
    const ctx = await this.loadContext(businessId, req.serviceId, req.professionalId, opts);
    const date = toLocalDate(req.startsAt, ctx.timezone);
    const busy = await this.loadBusy(db, businessId, ctx, date, date, opts);

    let firstError: SlotCheck | undefined;
    const candidates: LoadedProfessional[] = [];
    for (const p of ctx.professionals) {
      const result = checkSlot(
        this.dayContext(ctx, p, date, busy.get(p.id) ?? [], opts),
        req.startsAt,
        opts.requireGrid,
      );
      if (result.ok) candidates.push(p);
      else firstError ??= result;
    }

    if (!candidates.length) {
      const reason = firstError && !firstError.ok ? firstError.reason : 'BUSY';
      throw new BadRequestException(SLOT_ERRORS[reason]);
    }

    let chosen = candidates[0];
    if (candidates.length > 1) {
      const loads = await db.appointment.groupBy({
        by: ['professionalId'],
        where: {
          professionalId: { in: candidates.map((c) => c.id) },
          status: { in: ACTIVE_STATUSES },
          startsAt: {
            gte: zonedToUtc(date, 0, ctx.timezone),
            lt: zonedToUtc(addDays(date, 1), 0, ctx.timezone),
          },
        },
        _count: { _all: true },
      });
      const load = (id: string) => loads.find((l) => l.professionalId === id)?._count._all ?? 0;
      chosen = [...candidates].sort(
        (a, b) => load(a.id) - load(b.id) || a.sortOrder - b.sortOrder,
      )[0];
    }
    return { professionalId: chosen.id, service: ctx.service, timezone: ctx.timezone };
  }

  // ───────────── carga de datos ─────────────

  private async loadContext(
    businessId: string,
    serviceId: string,
    professionalId: string | undefined,
    opts: AvailabilityOptions,
  ): Promise<Context> {
    const [business, service] = await Promise.all([
      this.business.getSchedulingContext(businessId),
      this.prisma.service.findFirst({
        where: {
          id: serviceId,
          businessId,
          deletedAt: null,
          ...(opts.includeInactiveService ? {} : { isActive: true }),
        },
        select: { id: true, name: true, durationMinutes: true, priceCents: true },
      }),
    ]);
    if (!service) throw new NotFoundException('Este servicio no está disponible');

    const professionals = await this.prisma.professional.findMany({
      where: {
        businessId,
        deletedAt: null,
        isActive: true,
        services: { some: { serviceId } },
        ...(professionalId ? { id: professionalId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sortOrder: true, workingHours: true },
    });
    if (professionalId && !professionals.length) {
      throw new BadRequestException('Ese profesional no realiza este servicio');
    }
    return { timezone: business.timezone, settings: business.settings, service, professionals };
  }

  /** Citas activas y bloqueos que tocan el rango de fechas, agrupados por profesional. */
  private async loadBusy(
    db: Db,
    businessId: string,
    ctx: Context,
    fromDate: string,
    toDate: string,
    opts: AvailabilityOptions,
  ): Promise<Map<string, Interval[]>> {
    const ids = ctx.professionals.map((p) => p.id);
    const from = zonedToUtc(fromDate, 0, ctx.timezone);
    const to = zonedToUtc(addDays(toDate, 1), 0, ctx.timezone);
    const overlaps = { startsAt: { lt: to }, endsAt: { gt: from } };

    const [appointments, timeOff] = await Promise.all([
      db.appointment.findMany({
        where: {
          businessId,
          professionalId: { in: ids },
          status: { in: ACTIVE_STATUSES },
          ...overlaps,
          ...(opts.excludeAppointmentId ? { NOT: { id: opts.excludeAppointmentId } } : {}),
        },
        select: { professionalId: true, startsAt: true, endsAt: true },
      }),
      db.timeOff.findMany({
        where: {
          businessId,
          OR: [{ professionalId: { in: ids } }, { professionalId: null }],
          ...overlaps,
        },
        select: { professionalId: true, startsAt: true, endsAt: true },
      }),
    ]);

    const map = new Map<string, Interval[]>(ids.map((id) => [id, []]));
    const push = (pid: string, s: Date, e: Date) =>
      map.get(pid)?.push({ start: s.getTime(), end: e.getTime() });
    for (const a of appointments) push(a.professionalId, a.startsAt, a.endsAt);
    for (const t of timeOff) {
      if (t.professionalId) push(t.professionalId, t.startsAt, t.endsAt);
      else ids.forEach((id) => push(id, t.startsAt, t.endsAt)); // cierre del negocio
    }
    return map;
  }

  private dayContext(
    ctx: Context,
    professional: LoadedProfessional,
    date: string,
    busy: Interval[],
    opts: AvailabilityOptions,
  ): DayContext {
    const weekday = weekdayOf(date);
    const opening = ctx.settings.openingHours.find((d) => d.weekday === weekday);
    const { booking } = ctx.settings;
    return {
      date,
      timezone: ctx.timezone,
      durationMinutes: ctx.service.durationMinutes,
      stepMinutes: booking.slotStepMinutes,
      bufferMinutes: booking.bufferMinutes,
      openingHours:
        !opening || opening.closed
          ? null
          : { startMinute: hhmmToMinutes(opening.open), endMinute: hhmmToMinutes(opening.close) },
      workingRanges: professional.workingHours.filter((w) => w.weekday === weekday),
      busy,
      now: opts.now ?? new Date(),
      minAdvanceMinutes: opts.ignoreAdvance ? 0 : booking.minAdvanceMinutes,
      maxAdvanceDays: opts.ignoreAdvance ? 3650 : booking.maxAdvanceDays,
    };
  }
}
