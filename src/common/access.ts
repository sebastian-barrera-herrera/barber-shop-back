import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth-user';

export const isStaffAdmin = (user: AuthUser) => user.role === 'OWNER' || user.role === 'ADMIN';

/**
 * Dueño y administrador gestionan a cualquier profesional;
 * un profesional solo gestiona lo suyo (horario, bloqueos, estados de sus citas).
 */
export function assertCanManageProfessional(
  user: AuthUser,
  professionalId: string | null | undefined,
) {
  if (isStaffAdmin(user)) return;
  if (!professionalId || user.pid !== professionalId) {
    throw new ForbiddenException('Solo puedes gestionar tu propia agenda');
  }
}

/** Filtro de alcance: un profesional solo ve sus propios registros. */
export function professionalScope(user: AuthUser): { professionalId?: string } {
  if (isStaffAdmin(user)) return {};
  // Un usuario PROFESSIONAL sin ficha vinculada no ve nada.
  return { professionalId: user.pid ?? '00000000-0000-0000-0000-000000000000' };
}
