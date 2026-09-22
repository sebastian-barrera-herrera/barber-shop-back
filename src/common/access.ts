import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth-user';

export const isStaffAdmin = (user: AuthUser) => user.role === 'OWNER' || user.role === 'ADMIN';

/** Secciones que el dueño puede abrirle a un profesional. */
export type Area = 'clients' | 'messages' | 'reports';

/** ¿Ve la agenda completa del negocio, o solo la suya? */
export const seesWholeAgenda = (user: AuthUser) => isStaffAdmin(user) || user.acc?.agenda === 'all';

export const canSee = (user: AuthUser, area: Area) => isStaffAdmin(user) || !!user.acc?.[area];

export function assertCanSee(user: AuthUser, area: Area) {
  if (!canSee(user, area)) throw new ForbiddenException('No tienes acceso a esta sección');
}

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
  if (seesWholeAgenda(user)) return {};
  // Un usuario PROFESSIONAL sin ficha vinculada no ve nada.
  return { professionalId: user.pid ?? '00000000-0000-0000-0000-000000000000' };
}
