import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('normaliza celulares colombianos escritos de distintas formas', () => {
    for (const raw of [
      '3001234567',
      '300 123 4567',
      '(300) 123-4567',
      '+57 300 123 4567',
      '573001234567',
    ]) {
      expect(normalizePhone(raw)).toBe('+573001234567');
    }
  });

  it('respeta números de otros países con prefijo', () => {
    expect(normalizePhone('+1 (212) 555-0100')).toBe('+12125550100');
  });

  it('rechaza números inválidos', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('hola')).toBeNull();
  });
});
