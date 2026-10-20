// COPIA de functions/src/common/rut.ts (prototipo). Pendiente: unificar en un solo módulo compartido.
// Validación y normalización del RUT chileno (D-024 P6). Lógica pura.
//
// Formatos aceptados (el resto se rechaza):
//   12345678-5, 123456785, 12.345.678-5, 12.345.678-k, 1.234.567-4   (con o sin guion; k o K)
// Cuerpo de 7 u 8 dígitos sin ceros a la izquierda (decisión propia, ver handoff: así cada RUT
// tiene una sola forma normalizada). Salida: `12345678-K` (sin puntos, con guion, K mayúscula),
// que cumple `^\d{7,8}-[0-9K]$` del modelo de datos.

const RUT_PLAIN = /^(\d{7,8})-?([0-9kK])$/;
const RUT_DOTTED = /^(\d{1,2}(?:\.\d{3}){2})-?([0-9kK])$/;
const MAX_INPUT_LENGTH = 20;

/** Dígito verificador (módulo 11) para un cuerpo numérico. Devuelve "0".."9" o "K". */
export function computeRutDv(body: string): string {
  let sum = 0;
  let weight = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  if (dv === 11) return "0";
  if (dv === 10) return "K";
  return String(dv);
}

/**
 * Normaliza y valida. Devuelve `12345678-K` o `null` si el formato o el dígito verificador
 * son incorrectos. Nunca lanza; el llamador decide el error (`INVALID_RUT`).
 */
export function normalizeRut(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (value.length === 0 || value.length > MAX_INPUT_LENGTH) return null;

  const match = RUT_PLAIN.exec(value) ?? RUT_DOTTED.exec(value);
  if (!match) return null;

  const body = (match[1] ?? "").replaceAll(".", "");
  const dv = (match[2] ?? "").toUpperCase();
  if (body.length < 7 || body.length > 8 || body.startsWith("0")) return null;
  if (computeRutDv(body) !== dv) return null;
  return `${body}-${dv}`;
}

export function isValidRut(input: unknown): boolean {
  return normalizeRut(input) !== null;
}
