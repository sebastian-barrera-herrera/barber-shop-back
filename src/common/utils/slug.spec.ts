import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('quita tildes, símbolos y espacios', () => {
    expect(slugify('Corte + Barba Clásico')).toBe('corte-barba-clasico');
    expect(slugify('  Uñas en gel  ')).toBe('unas-en-gel');
    expect(slugify('Spa & Belleza')).toBe('spa-y-belleza');
  });

  it('nunca devuelve vacío', () => {
    expect(slugify('***')).toBe('item');
  });
});

describe('uniqueSlug', () => {
  it('agrega sufijo numérico cuando ya existe', async () => {
    const taken = new Set(['corte', 'corte-2']);
    await expect(uniqueSlug('Corte', async (s) => taken.has(s))).resolves.toBe('corte-3');
  });

  it('usa el slug base si está libre', async () => {
    await expect(uniqueSlug('Barba', async () => false)).resolves.toBe('barba');
  });
});
