import { BadRequestException } from '@nestjs/common';

/**
 * En un PATCH, `@IsOptional()` deja pasar `null`. Para campos obligatorios eso
 * significaría "borrar" un valor requerido, así que se rechaza con un mensaje claro.
 */
export function assertNoNulls<T extends object>(dto: T, keys: (keyof T)[]) {
  const invalid = keys.filter((k) => dto[k] === null);
  if (invalid.length) {
    throw new BadRequestException(`Estos campos no pueden quedar vacíos: ${invalid.join(', ')}`);
  }
}
