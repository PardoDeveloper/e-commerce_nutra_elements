import { appError } from "./errors.js";

// Forma mínima de `CallableRequest` que necesitamos. Así los tests no dependen del SDK y los
// callables reales (`CallableRequest`) la cumplen de forma estructural.
export interface AuthRequestLike {
  auth?: { uid: string; token?: { admin?: unknown; [claim: string]: unknown } } | null | undefined;
  app?: unknown;
}

/** Exige sesión. Devuelve el uid. Sin sesión: `unauthenticated` / `UNAUTHENTICATED`. */
export function assertAuthenticated(request: AuthRequestLike): string {
  const uid = request.auth?.uid;
  if (typeof uid !== "string" || uid.length === 0) throw appError("UNAUTHENTICATED");
  return uid;
}

/**
 * Exige sesión y el custom claim `admin === true` (D-011). Devuelve el uid.
 * Se compara con `=== true` estricto: "true", 1 u otros valores truthy NO cuentan.
 * Sin sesión: `UNAUTHENTICATED`; con sesión sin claim: `permission-denied` / `NOT_ADMIN`.
 */
export function assertAdmin(request: AuthRequestLike): string {
  const uid = assertAuthenticated(request);
  if (request.auth?.token?.admin !== true) throw appError("NOT_ADMIN");
  return uid;
}

/**
 * ¿Se exige App Check? Contrato functions.md, sección 1: sí en la nube; en el emulador local
 * se desactiva. Falla cerrado: solo `APP_ENV === "local"` lo desactiva; si la variable falta o
 * tiene otro valor, se exige.
 */
export function isAppCheckEnforced(appEnv: string | undefined = process.env["APP_ENV"]): boolean {
  return appEnv !== "local";
}

/**
 * Opciones para el segundo argumento de `onCall(...)` en los callables públicos y de admin.
 * Ejemplo: `onCall({ ...callableSecurityOptions(), timeoutSeconds: 30 }, handler)`.
 * Se evalúa al cargar el módulo; `APP_ENV` viene de `functions/.env.*` o de la configuración.
 */
export function callableSecurityOptions(appEnv?: string): { enforceAppCheck: boolean } {
  return { enforceAppCheck: isAppCheckEnforced(appEnv) };
}

/**
 * Verificación manual de App Check (opcional): útil si se quiere el `details.code`
 * `APP_CHECK_FAILED` del contrato en lugar del error genérico del SDK. Solo actúa si se exige.
 */
export function assertAppCheck(request: AuthRequestLike, appEnv?: string): void {
  if (isAppCheckEnforced(appEnv) && !request.app) throw appError("APP_CHECK_FAILED");
}
