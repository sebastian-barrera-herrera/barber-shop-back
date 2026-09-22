/** "Corte + Barba Clásico" → "corte-barba-clasico" */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/&/g, ' y ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

/**
 * Devuelve un slug libre agregando -2, -3… si ya existe.
 * `exists` consulta la tabla correspondiente dentro del negocio.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  for (let i = 2; await exists(candidate); i++) candidate = `${root}-${i}`;
  return candidate;
}
