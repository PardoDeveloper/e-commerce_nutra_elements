// Reintento de una callable cuando el SDK de Functions la rechaza por un token vencido.
//
// `enforceAppCheck` y la verificación del ID token ocurren ANTES del handler: si alguno llega
// vencido (por ejemplo, App Check en una pestaña que estuvo en segundo plano o con el equipo
// suspendido), el servidor responde `unauthenticated` SIN `details.code` y no ejecuta nada.
// En ese caso es seguro renovar los tokens y repetir la llamada una vez.

/** ¿Es un `unauthenticated` del SDK (sin código de aplicación), es decir, el handler no llegó a correr? */
export function isTokenRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, details } = error as { code?: unknown; details?: unknown };
  if (code !== "functions/unauthenticated" && code !== "unauthenticated") return false;
  const appCode = typeof details === "object" && details !== null ? (details as { code?: unknown }).code : undefined;
  return typeof appCode !== "string";
}

/** Ejecuta `call`; si el SDK rechazó los tokens, los renueva con `refresh` y reintenta una sola vez. */
export async function withTokenRetry<T>(call: () => Promise<T>, refresh: () => Promise<void>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!isTokenRejection(error)) throw error;
    try {
      await refresh();
    } catch {
      throw error;
    }
    return call();
  }
}
