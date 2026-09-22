import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Cifrado de secretos guardados en la BD (credenciales de pago por negocio).
 * AES-256-GCM: formato "v1.<iv>.<tag>.<datos>" en base64url.
 * La clave viene de ENCRYPTION_KEY (32 bytes en base64) y nunca se guarda en la BD.
 */
function key(raw: string | undefined): Buffer {
  if (!raw) throw new Error('Falta ENCRYPTION_KEY para cifrar credenciales');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY debe ser de 32 bytes en base64');
  return buf;
}

export function encrypt(plain: string, rawKey: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(rawKey), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv, tag, data]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decrypt(payload: string, rawKey: string | undefined): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato cifrado inválido');
  const decipher = createDecipheriv('aes-256-gcm', key(rawKey), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

/** Comparación en tiempo constante (firmas de webhooks). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
