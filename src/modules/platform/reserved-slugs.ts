/**
 * Direcciones que ninguna empresa puede tomar: son rutas de la plataforma
 * (filo.com/admin, filo.com/registro…) o nombres que se prestan a engaño.
 */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'ayuda',
  'blog',
  'cita',
  'contacto',
  'entrar',
  'filo',
  'login',
  'logout',
  'nosotros',
  'planes',
  'precios',
  'privacidad',
  'recuperar',
  'registro',
  'reservar',
  'restablecer',
  'robots.txt',
  'sitemap.xml',
  'soporte',
  'static',
  'superadmin',
  'terminos',
  'www',
  '_next',
]);

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function slugProblem(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug) || slug.includes('--')) {
    return 'Usa entre 3 y 40 letras minúsculas, números o guiones (sin empezar ni terminar en guion)';
  }
  if (RESERVED_SLUGS.has(slug)) return 'Esa dirección está reservada, prueba con otra';
  return null;
}
