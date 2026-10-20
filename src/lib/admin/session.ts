// Sesión SIMULADA del admin (D-028): cualquier correo y contraseña ingresan y la sesión queda
// en sessionStorage (se pierde al cerrar la pestaña). NO es autenticación real: ver config.ts.
// Solo cliente; pensado para useSyncExternalStore.
import { DEMO_SESSION_KEY } from "./config";
import { getActiveDataSource, isDemoLoginAvailable } from "./mode";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Texto crudo de la sesión ("" = sin sesión). Estable entre llamadas, como pide useSyncExternalStore. */
export function getSessionSnapshot(): string {
  try {
    return window.sessionStorage.getItem(DEMO_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

/** En el servidor aún no se sabe: `null` = cargando. */
export const getServerSessionSnapshot = (): string | null => null;

export function sessionEmail(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { email?: unknown };
    return typeof parsed.email === "string" ? parsed.email : "";
  } catch {
    return "";
  }
}

export function demoLogin(email: string): void {
  // Defensa en profundidad: con Firebase el login simulado no existe, aunque alguien llame a esta función.
  if (!isDemoLoginAvailable(getActiveDataSource())) return;
  window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ email: email.trim(), at: Date.now() }));
  notify();
}

export function demoLogout(): void {
  window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  notify();
}
