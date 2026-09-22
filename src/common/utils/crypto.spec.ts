import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, safeEqual, sha256Hex } from './crypto';

describe('crypto', () => {
  const key = randomBytes(32).toString('base64');

  it('cifra y descifra; cada cifrado es distinto', () => {
    const a = encrypt('prv_test_123', key);
    const b = encrypt('prv_test_123', key);
    expect(a).not.toBe(b);
    expect(a).not.toContain('prv_test_123');
    expect(decrypt(a, key)).toBe('prv_test_123');
  });

  it('detecta datos alterados o clave equivocada', () => {
    const payload = encrypt('secreto', key);
    const parts = payload.split('.');
    parts[3] = Buffer.from('otro').toString('base64url');
    expect(() => decrypt(parts.join('.'), key)).toThrow();
    expect(() => decrypt(payload, randomBytes(32).toString('base64'))).toThrow();
  });

  it('exige una clave de 32 bytes', () => {
    expect(() => encrypt('x', undefined)).toThrow('Falta ENCRYPTION_KEY');
    expect(() => encrypt('x', 'corta')).toThrow('32 bytes');
  });

  it('sha256 y comparación segura', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
