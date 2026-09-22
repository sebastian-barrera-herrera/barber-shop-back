import { minutesToHhmm, toLocalMinute, zonedToUtc } from '../../common/utils/time';
import { checkSlot, computeSlots, DayContext, effectiveRanges } from './engine';

const TZ = 'America/Bogota';
const DATE = '2026-09-28'; // lunes
const h = (hh: number, mm = 0) => hh * 60 + mm;
const at = (hh: number, mm = 0, date = DATE) => zonedToUtc(date, h(hh, mm), TZ);
const busy = (fromH: number, fromM: number, toH: number, toM: number) => ({
  start: at(fromH, fromM).getTime(),
  end: at(toH, toM).getTime(),
});

/** Carlos: lunes 9–18 con almuerzo 13–14; el negocio abre 8–20. "Ahora" = domingo anterior. */
function ctx(overrides: Partial<DayContext> = {}): DayContext {
  return {
    date: DATE,
    timezone: TZ,
    durationMinutes: 30,
    stepMinutes: 30,
    bufferMinutes: 0,
    openingHours: { startMinute: h(8), endMinute: h(20) },
    workingRanges: [
      { startMinute: h(9), endMinute: h(13) },
      { startMinute: h(14), endMinute: h(18) },
    ],
    busy: [],
    now: new Date('2026-09-27T12:00:00Z'),
    minAdvanceMinutes: 60,
    maxAdvanceDays: 30,
    ...overrides,
  };
}

const times = (slots: Date[]) => slots.map((d) => minutesToHhmm(toLocalMinute(d, TZ)));

describe('Motor de disponibilidad', () => {
  it('día normal: franjas cada 30 min respetando la pausa de almuerzo', () => {
    const t = times(computeSlots(ctx()));
    expect(t[0]).toBe('09:00');
    expect(t).toContain('12:30');
    expect(t).not.toContain('13:00');
    expect(t).not.toContain('13:30');
    expect(t).toContain('14:00');
    expect(t[t.length - 1]).toBe('17:30');
    expect(t).toHaveLength(16);
  });

  it('una cita existente de 14:00 a 15:00 ocupa esas horas', () => {
    const t = times(computeSlots(ctx({ busy: [busy(14, 0, 15, 0)] })));
    expect(t).not.toContain('14:00');
    expect(t).not.toContain('14:30');
    expect(t).toContain('15:00');
    expect(t).toContain('12:30');
  });

  it('servicio de 60 min: no se ofrece si se cruza con una cita ni si no cabe antes del cierre', () => {
    const t = times(computeSlots(ctx({ durationMinutes: 60, busy: [busy(15, 0, 15, 30)] })));
    expect(t).not.toContain('14:30'); // 14:30–15:30 se cruza con la cita de 15:00
    expect(t).toContain('14:00');
    expect(t).toContain('15:30');
    expect(t).not.toContain('17:30'); // terminaría 18:30, después de la salida
    expect(t[t.length - 1]).toBe('17:00');
    expect(t).not.toContain('12:30'); // 12:30–13:30 invade el almuerzo
  });

  it('servicio de 30 min cabe justo antes de la pausa y del cierre', () => {
    const t = times(computeSlots(ctx({ durationMinutes: 30 })));
    expect(t).toContain('12:30');
    expect(t).toContain('17:30');
  });

  it('profesional ocupado todo el día: no hay horas', () => {
    expect(computeSlots(ctx({ busy: [busy(8, 0, 20, 0)] }))).toEqual([]);
  });

  it('día no laboral del profesional: sin horas', () => {
    expect(computeSlots(ctx({ workingRanges: [] }))).toEqual([]);
  });

  it('negocio cerrado ese día: sin horas aunque el profesional trabaje', () => {
    expect(computeSlots(ctx({ openingHours: null }))).toEqual([]);
  });

  it('el horario del profesional se recorta al del negocio', () => {
    const t = times(computeSlots(ctx({ openingHours: { startMinute: h(10), endMinute: h(16) } })));
    expect(t[0]).toBe('10:00');
    expect(t[t.length - 1]).toBe('15:30');
  });

  it('bloqueo de horario (cita médica 10:00–11:30) quita esas horas', () => {
    const t = times(computeSlots(ctx({ busy: [busy(10, 0, 11, 30)] })));
    expect(t).toContain('09:30');
    expect(t).not.toContain('10:00');
    expect(t).not.toContain('11:00');
    expect(t).toContain('11:30');
  });

  it('una cita cancelada no se pasa como ocupada, así que la hora vuelve a estar libre', () => {
    // El servicio filtra CANCELLED/NO_SHOW antes de llamar al motor.
    expect(times(computeSlots(ctx({ busy: [] })))).toContain('14:00');
  });

  it('anticipación mínima: hoy no ofrece horas que empiecen en menos de 60 min', () => {
    const now = at(10, 10); // 10:10 del mismo día
    const t = times(computeSlots(ctx({ now })));
    expect(t).not.toContain('11:00');
    expect(t[0]).toBe('11:30');
  });

  it('fechas pasadas o más allá de la anticipación máxima: vacío', () => {
    expect(computeSlots(ctx({ date: '2026-09-20' }))).toEqual([]);
    expect(computeSlots(ctx({ maxAdvanceDays: 0 }))).toEqual([]);
    expect(computeSlots(ctx({ maxAdvanceDays: 1 }))).not.toEqual([]);
  });

  it('margen entre citas: deja espacio antes y después de cada cita', () => {
    const t = times(
      computeSlots(ctx({ bufferMinutes: 15, stepMinutes: 15, busy: [busy(11, 0, 11, 30)] })),
    );
    expect(t).not.toContain('10:30'); // terminaría 11:00, sin margen
    expect(t).toContain('10:15');
    expect(t).not.toContain('11:30');
    expect(t).toContain('11:45');
  });

  it('paso de 15 minutos con franjas que empiezan en horas "raras"', () => {
    const t = times(
      computeSlots(
        ctx({ stepMinutes: 15, workingRanges: [{ startMinute: h(9, 10), endMinute: h(10) }] }),
      ),
    );
    expect(t).toEqual(['09:15', '09:30']);
  });

  it('une franjas que se solapan', () => {
    expect(
      effectiveRanges({
        openingHours: { startMinute: 0, endMinute: 1440 },
        workingRanges: [
          { startMinute: h(14), endMinute: h(18) },
          { startMinute: h(9), endMinute: h(12) },
          { startMinute: h(11), endMinute: h(13) },
        ],
      }),
    ).toEqual([
      { startMinute: h(9), endMinute: h(13) },
      { startMinute: h(14), endMinute: h(18) },
    ]);
  });
});

describe('checkSlot', () => {
  it('acepta una hora libre dentro del horario', () => {
    expect(checkSlot(ctx(), at(15, 0), true)).toEqual({ ok: true });
  });

  it('rechaza con el motivo correcto', () => {
    expect(checkSlot(ctx({ busy: [busy(15, 0, 16, 0)] }), at(15, 30), true)).toEqual({
      ok: false,
      reason: 'BUSY',
    });
    expect(checkSlot(ctx(), at(13, 0), true)).toEqual({ ok: false, reason: 'OUTSIDE_HOURS' });
    expect(checkSlot(ctx(), at(17, 45), false)).toEqual({ ok: false, reason: 'OUTSIDE_HOURS' });
    expect(checkSlot(ctx(), at(10, 5), true)).toEqual({ ok: false, reason: 'OFF_GRID' });
    expect(checkSlot(ctx({ now: at(9, 30) }), at(10, 0), true)).toEqual({
      ok: false,
      reason: 'TOO_SOON',
    });
    expect(checkSlot(ctx(), at(10, 0, '2026-09-29'), true)).toEqual({
      ok: false,
      reason: 'OUT_OF_WINDOW',
    });
  });

  it('el panel acepta horas fuera de la cuadrícula (10:05)', () => {
    expect(checkSlot(ctx(), at(10, 5), false)).toEqual({ ok: true });
  });
});
