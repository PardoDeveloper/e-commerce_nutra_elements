// Configuración global del sitio (solo servidor). Ver contrato SEO 06, sección 2.

export const SITE_NAME = "Nutra Elements";
export const SITE_DESCRIPTION =
  "Suplementos alimenticios en Chile. Vitaminas, magnesio, minerales, omega-3, belleza y bienestar.";

/** Origen del sitio sin barra final. Por defecto, el origen local. */
export function getSiteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.SITE_URL?.trim();
  const url = raw && raw.length > 0 ? raw : "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

/**
 * Interruptor único de indexación. Solo el valor exacto "true" habilita la
 * indexación; cualquier otro valor (o ausencia) deja el sitio en noindex.
 */
export function isIndexable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SITE_INDEXABLE === "true";
}
