import {
  addDays,
  daysBetween,
  hhmmToMinutes,
  isLocalDate,
  minutesToHhmm,
  toLocalDate,
  toLocalMinute,
  weekdayOf,
  zonedToUtc,
} from './time';

describe('time utils', () => {
  it('convierte hora local de Bogotá (UTC-5) a UTC', () => {
    expect(zonedToUtc('2026-09-25', 16 * 60, 'America/Bogota').toISOString()).toBe(
      '2026-09-25T21:00:00.000Z',
    );
  });

  it('una hora local tarde cae en el día siguiente en UTC', () => {
    expect(zonedToUtc('2026-09-25', 21 * 60, 'America/Bogota').toISOString()).toBe(
      '2026-09-26T02:00:00.000Z',
    );
  });

  it('respeta el cambio de horario (DST) en Nueva York', () => {
    // 8 de marzo 2026: a las 2:00 se adelanta a las 3:00 (EST -5 → EDT -4)
    expect(zonedToUtc('2026-03-07', 10 * 60, 'America/New_York').toISOString()).toBe(
      '2026-03-07T15:00:00.000Z',
    );
    expect(zonedToUtc('2026-03-09', 10 * 60, 'America/New_York').toISOString()).toBe(
      '2026-03-09T14:00:00.000Z',
    );
  });

  it('instante UTC → fecha y minuto locales', () => {
    const d = new Date('2026-09-26T02:30:00Z');
    expect(toLocalDate(d, 'America/Bogota')).toBe('2026-09-25');
    expect(toLocalMinute(d, 'America/Bogota')).toBe(21 * 60 + 30);
  });

  it('día de la semana, suma y diferencia de días', () => {
    expect(weekdayOf('2026-09-21')).toBe(1); // lunes
    expect(weekdayOf('2026-09-27')).toBe(0); // domingo
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-09-21', '2026-10-01')).toBe(10);
  });

  it('valida fechas locales', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('26-2-3')).toBe(false);
  });

  it('HH:mm ↔ minutos', () => {
    expect(hhmmToMinutes('09:30')).toBe(570);
    expect(minutesToHhmm(570)).toBe('09:30');
    expect(minutesToHhmm(1440)).toBe('24:00');
  });
});
