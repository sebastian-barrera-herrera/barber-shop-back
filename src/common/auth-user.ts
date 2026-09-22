import type { Role } from '@prisma/client';
import type { ProfessionalAccess } from '../modules/professionals/access.schema';

/** Usuario autenticado tal como viaja en el JWT de acceso. */
export interface AuthUser {
  /** id del usuario */
  sub: string;
  /** id del negocio: fuente única del tenant en rutas privadas */
  bid: string;
  role: Role;
  /** id del profesional vinculado, si el usuario es PROFESSIONAL */
  pid?: string;
  /** Qué secciones puede ver ese profesional (lo define el dueño) */
  acc?: ProfessionalAccess;
}
