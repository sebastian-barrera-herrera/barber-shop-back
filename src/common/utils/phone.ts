import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * Normaliza un teléfono a E.164 (+573001234567). Acepta "300 123 4567", "(300) 123-4567",
 * "+57 300…". Sin prefijo internacional, asume el país del negocio.
 * Devuelve null si no es un número válido.
 */
export function normalizePhone(raw: string, defaultCountry = 'CO'): string | null {
  const parsed = parsePhoneNumberFromString(raw, defaultCountry.toUpperCase() as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}
