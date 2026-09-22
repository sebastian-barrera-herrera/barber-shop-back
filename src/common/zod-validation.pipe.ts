import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/** Valida el cuerpo con un esquema zod y responde con el primer error en lenguaje claro. */
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<
  unknown,
  z.output<S>
> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
      throw new BadRequestException(`${where}${issue.message}`);
    }
    return result.data;
  }
}
