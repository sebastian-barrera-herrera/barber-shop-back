import type { Role } from '@prisma/client';

/** Usuario autenticado tal como viaja en el JWT de acceso. */
export interface AuthUser {
  /** id del usuario */
  sub: string;
  /** id del negocio: fuente única del tenant en rutas privadas */
  bid: string;
  role: Role;
  /** id del profesional vinculado, si el usuario es PROFESSIONAL */
  pid?: string;
}
