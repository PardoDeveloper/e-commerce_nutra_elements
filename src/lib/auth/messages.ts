// Mensajes de error de autenticación en español. Regla: nunca revelar si un correo existe
// (user-not-found, wrong-password e invalid-credential dan el mismo texto).

export const NOT_ADMIN_MESSAGE = "Tu cuenta no tiene permisos de administrador.";
export const GENERIC_LOGIN_ERROR = "No pudimos iniciar sesión. Inténtalo de nuevo.";
export const INVALID_CREDENTIALS_MESSAGE = "Correo o contraseña incorrectos.";
export const AUTH_NOT_ENABLED_MESSAGE =
  "El inicio de sesión aún no está habilitado en este entorno (falta activar el proveedor en Firebase Authentication). Avisa a quien administra el proyecto.";

/** Código de un error de Firebase (`auth/...`, `functions/...`), o "" si no lo trae. */
export function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

const BY_CODE: Record<string, string> = {
  "auth/invalid-credential": INVALID_CREDENTIALS_MESSAGE,
  "auth/wrong-password": INVALID_CREDENTIALS_MESSAGE,
  "auth/user-not-found": INVALID_CREDENTIALS_MESSAGE,
  "auth/invalid-login-credentials": INVALID_CREDENTIALS_MESSAGE,
  // Cuenta deshabilitada: mismo texto que las credenciales inválidas, para no confirmar que la cuenta existe.
  "auth/user-disabled": INVALID_CREDENTIALS_MESSAGE,
  "auth/invalid-email": "Revisa el formato del correo electrónico.",
  "auth/missing-password": "Escribe tu contraseña.",
  "auth/missing-email": "Escribe tu correo electrónico.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  "auth/network-request-failed": "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.",
  "auth/configuration-not-found": AUTH_NOT_ENABLED_MESSAGE,
  "auth/operation-not-allowed": AUTH_NOT_ENABLED_MESSAGE,
  "auth/admin-restricted-operation": AUTH_NOT_ENABLED_MESSAGE,
  "auth/unauthorized-domain": "Este dominio no está autorizado para iniciar sesión. Avisa a quien administra el proyecto.",
  "auth/invalid-api-key": "La configuración de Firebase de este entorno no es válida.",
  "auth/api-key-not-valid": "La configuración de Firebase de este entorno no es válida.",
  "auth/app-not-authorized": "La configuración de Firebase de este entorno no es válida.",
  "auth/popup-blocked": "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.",
  "auth/popup-closed-by-user": "Se cerró la ventana de Google antes de terminar. Inténtalo de nuevo.",
  "auth/cancelled-popup-request": "Se cerró la ventana de Google antes de terminar. Inténtalo de nuevo.",
};

export function authErrorMessage(error: unknown): string {
  return BY_CODE[errorCode(error)] ?? GENERIC_LOGIN_ERROR;
}

/** Respuesta al pedir recuperar la contraseña: es la misma exista o no el correo. */
export const RESET_SENT_MESSAGE =
  "Si el correo está registrado, recibirás un mensaje con las instrucciones para crear una contraseña nueva.";

/** Errores del envío del correo de recuperación que NO se informan (revelarían si el correo existe). */
export function isSilentResetError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "auth/user-not-found" || code === "auth/invalid-credential";
}
