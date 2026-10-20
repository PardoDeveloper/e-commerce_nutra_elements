// ÚNICA fuente de verdad de la fuente de datos ("demo" o "firebase"). Apta para servidor.
// En el navegador `process.env.DATA_SOURCE` y `K_SERVICE` no existen: allí la fuente llega por props desde el servidor.
export type DataSource = "demo" | "firebase";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Falla cerrado (B-1, D-031):
 *  - Si existe `K_SERVICE` (Cloud Run / App Hosting) o `FIREBASE_CONFIG` (Firebase), siempre es "firebase",
 *    sin importar `DATA_SOURCE`: la nube nunca puede caer en el modo demo.
 *  - En local, "firebase" solo si `DATA_SOURCE` vale firebase (sin mayúsculas ni espacios); si no, "demo".
 */
export function resolveDataSource(env: Env = process.env): DataSource {
  if (env.K_SERVICE || env.FIREBASE_CONFIG) return "firebase";
  return env.DATA_SOURCE?.trim().toLowerCase() === "firebase" ? "firebase" : "demo";
}

/** ¿Estamos en modo demo (login simulado, semilla y banners de demostración)? */
export function isDemoMode(env: Env = process.env): boolean {
  return resolveDataSource(env) === "demo";
}
