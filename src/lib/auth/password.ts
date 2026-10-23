// Cambio de la propia contraseña (perfil del admin). Lógica pura: validación del formulario y
// mensajes de error de Firebase Auth en español. La llamada real está en admin-auth.ts.
import { errorCode } from "./messages";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordChangeInput {
  current: string;
  next: string;
  confirm: string;
}

export type PasswordField = keyof PasswordChangeInput;

/** Primer problema del formulario, o `null` si se puede enviar. No se recortan espacios: son parte de la contraseña. */
export function validatePasswordChange(input: PasswordChangeInput): { field: PasswordField; message: string } | null {
  if (input.current === "") return { field: "current", message: "Escribe tu contraseña actual." };
  if (input.next === "") return { field: "next", message: "Escribe la contraseña nueva." };
  if (input.next.length < PASSWORD_MIN_LENGTH) {
    return { field: "next", message: `La contraseña nueva debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.` };
  }
  if (input.next.length > PASSWORD_MAX_LENGTH) {
    return { field: "next", message: `La contraseña nueva puede tener como máximo ${PASSWORD_MAX_LENGTH} caracteres.` };
  }
  if (input.next === input.current) return { field: "next", message: "La contraseña nueva debe ser distinta de la actual." };
  if (input.confirm !== input.next) return { field: "confirm", message: "La confirmación no coincide con la contraseña nueva." };
  return null;
}

export const WRONG_CURRENT_PASSWORD_MESSAGE = "La contraseña actual no es correcta.";
export const PASSWORD_CHANGED_MESSAGE = "Contraseña actualizada. Úsala la próxima vez que inicies sesión.";
export const NO_PASSWORD_ACCOUNT_MESSAGE = "Tu cuenta no inicia sesión con correo y contraseña, así que no tiene una contraseña que cambiar.";

const BY_CODE: Record<string, string> = {
  "auth/wrong-password": WRONG_CURRENT_PASSWORD_MESSAGE,
  "auth/invalid-credential": WRONG_CURRENT_PASSWORD_MESSAGE,
  "auth/invalid-login-credentials": WRONG_CURRENT_PASSWORD_MESSAGE,
  "auth/missing-password": "Escribe tu contraseña actual.",
  "auth/weak-password": `La contraseña nueva es muy débil. Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  "auth/password-does-not-meet-requirements": "La contraseña nueva no cumple los requisitos del proyecto (largo o tipos de caracteres).",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  "auth/network-request-failed": "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.",
  "auth/requires-recent-login": "Por seguridad, cierra sesión, vuelve a entrar e inténtalo de nuevo.",
  "auth/user-token-expired": "Tu sesión expiró. Vuelve a iniciar sesión.",
  "auth/user-mismatch": "La sesión cambió mientras se guardaba. Vuelve a iniciar sesión.",
};

export function passwordChangeErrorMessage(error: unknown): string {
  return BY_CODE[errorCode(error)] ?? "No se pudo cambiar la contraseña. Inténtalo de nuevo.";
}
