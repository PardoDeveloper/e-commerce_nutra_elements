// Verificación del permiso de administrador (D-011 y D-031). Lógica pura con dependencias inyectadas,
// para probarla sin Firebase. La seguridad real está en las reglas y las Functions: esto solo decide
// si el panel se muestra.
//
// Flujo: si el token ya trae `admin === true`, listo. Si no, `claimAdmin` (asigna el claim solo si el correo
// está en ADMIN_EMAILS y verificado), luego `getIdToken(true)` para refrescar y se vuelve a leer el claim.
import { errorCode, NOT_ADMIN_MESSAGE } from "./messages";

export type AdminCheck =
  | { ok: true }
  | { ok: false; reason: "not-admin" | "unavailable" | "error"; message: string };

export interface AdminCheckDeps {
  /** Lee el claim `admin` del token. Con `refresh` fuerza un token nuevo (`getIdToken(true)`). */
  hasAdminClaim(refresh: boolean): Promise<boolean>;
  /** Llama a la callable `claimAdmin` (us-east4). Lanza si la función rechaza o no existe. */
  claimAdmin(): Promise<unknown>;
}

export const UNAVAILABLE_MESSAGE =
  "No pudimos verificar tus permisos: la función de acceso aún no está disponible. Inténtalo más tarde.";

function classify(error: unknown): AdminCheck {
  const code = errorCode(error);
  if (code === "functions/permission-denied") return { ok: false, reason: "not-admin", message: NOT_ADMIN_MESSAGE };
  if (code === "functions/not-found" || code === "functions/unavailable" || code === "functions/deadline-exceeded") {
    return { ok: false, reason: "unavailable", message: UNAVAILABLE_MESSAGE };
  }
  if (code === "functions/unauthenticated") {
    return { ok: false, reason: "error", message: "Tu sesión no es válida. Vuelve a iniciar sesión." };
  }
  if (code === "functions/failed-precondition") {
    return { ok: false, reason: "error", message: "La verificación de seguridad (App Check) falló. Recarga la página e inténtalo de nuevo." };
  }
  return { ok: false, reason: "error", message: "No pudimos verificar tus permisos. Inténtalo de nuevo." };
}

function isClaimed(response: unknown): boolean {
  return typeof response === "object" && response !== null && (response as { admin?: unknown }).admin === true;
}

export async function ensureAdmin(deps: AdminCheckDeps): Promise<AdminCheck> {
  try {
    if (await deps.hasAdminClaim(false)) return { ok: true };
    const response = await deps.claimAdmin();
    if (!isClaimed(response)) return { ok: false, reason: "not-admin", message: NOT_ADMIN_MESSAGE };
    // Respuesta OK o alreadyAdmin: el token viejo no trae el claim hasta refrescarlo.
    if (await deps.hasAdminClaim(true)) return { ok: true };
    return { ok: false, reason: "not-admin", message: NOT_ADMIN_MESSAGE };
  } catch (error) {
    return classify(error);
  }
}
