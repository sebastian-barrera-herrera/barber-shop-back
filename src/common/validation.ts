import { registerDecorator, ValidationOptions } from 'class-validator';
import { isLocalDate } from './utils/time';
import { Transform } from 'class-transformer';

/** Recorta espacios en strings. Vacío → undefined (así "" no pisa un valor existente). */
export const Trim = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const v = value.trim();
    return v === '' ? undefined : v;
  });

/** Query string "true"/"false" → boolean. */
export const ToBoolean = () =>
  Transform(({ value }) =>
    value === true || value === 'true' || value === '1'
      ? true
      : value === false || value === 'false' || value === '0'
        ? false
        : value,
  );

/** Fecha local 'AAAA-MM-DD' válida (rechaza 2026-02-30). */
export function IsLocalDate(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isLocalDate',
      target: object.constructor,
      propertyName,
      options: { message: 'Usa una fecha válida con formato AAAA-MM-DD', ...options },
      validator: { validate: (value: unknown) => typeof value === 'string' && isLocalDate(value) },
    });
}
