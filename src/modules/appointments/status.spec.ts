import { canTransition } from './status';

describe('transiciones de estado de una cita', () => {
  it('permite el recorrido normal', () => {
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition('CONFIRMED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('permite cancelar o marcar "no asistió" antes de empezar', () => {
    expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
    expect(canTransition('CONFIRMED', 'NO_SHOW')).toBe(true);
  });

  it('no permite volver atrás ni salir de estados finales', () => {
    expect(canTransition('COMPLETED', 'PENDING')).toBe(false);
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canTransition('NO_SHOW', 'COMPLETED')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'NO_SHOW')).toBe(false);
  });
});
