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
