import { HttpsError } from "firebase-functions/v2/https";

// Errores propios de admin/ (contrato functions.md 5.8 y 5.8b). `common/errors.ts` no los incluye, así que
// se crean aquí con la misma forma: `details.code` es el código de aplicación. Mensajes fijos en español,
// sin datos del request.
const ADMIN_ERRORS = {
  NOT_ALLOWED: ["permission-denied", "Esta cuenta no puede habilitarse como administrador."],
  USER_NOT_FOUND: ["not-found", "No existe un usuario con ese correo."],
  CANNOT_REVOKE_SELF: ["failed-precondition", "No puedes quitarte el rol de administrador a ti mismo."],
} as const;

export type AdminErrorCode = keyof typeof ADMIN_ERRORS;

export function adminError(code: AdminErrorCode): HttpsError {
  const [httpsCode, message] = ADMIN_ERRORS[code];
  return new HttpsError(httpsCode, message, { code });
}
