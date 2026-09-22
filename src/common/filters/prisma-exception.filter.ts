import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/** Traduce errores conocidos de Prisma a respuestas HTTP claras (sin filtrar detalles internos). */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(err: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'Ya existe un registro con esos datos'],
      P2003: [HttpStatus.CONFLICT, 'Este registro está en uso y no se puede modificar así'],
      P2025: [HttpStatus.NOT_FOUND, 'No encontramos lo que buscas'],
    };
    const [status, message] = map[err.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Algo salió mal'];
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) this.logger.error(err.message, err.stack);
    res.status(status).json({ statusCode: status, message });
  }
}
