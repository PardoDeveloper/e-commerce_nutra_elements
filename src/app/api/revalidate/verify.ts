// Verificación y validación de POST /api/revalidate (contrato functions.md 8.2).
// Lógica pura y sin dependencias de Next, para poder probarla con vitest.
import { createHmac, timingSafeEqual } from "node:crypto";

/** Tolerancia entre el timestamp firmado y el reloj del servidor (anti-replay): 5 minutos. */
export const MAX_SKEW_SECONDS = 300;
export const MAX_PATHS = 50;
export const MAX_TAGS = 10;
export const ALLOWED_TAGS = ["catalog", "settings"] as const;
export type RevalidateTag = (typeof ALLOWED_TAGS)[number];

const SLUG = "[a-z0-9-]{1,80}";
const STATIC_PATHS = new Set([
  "/",
  "/productos",
  "/nosotros",
  "/contacto",
  "/preguntas-frecuentes",
  "/terminos",
  "/privacidad",
  "/cambios-y-devoluciones",
  "/sitemap.xml",
]);
const DYNAMIC_PATH = new RegExp(`^/(productos|categorias)/${SLUG}$`);

/** HMAC-SHA256 en hex de `${timestamp}.${cuerpoCrudo}`. Igual que functions/src/triggers/revalidate.ts. */
export function signBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export type SignatureResult = "ok" | "invalid";

/**
 * Comprueba cabeceras, ventana de tiempo y firma (comparación en tiempo constante).
 * No distingue el motivo hacia afuera: el llamador responde 401 sin detalle.
 */
export function verifyRequest(
  secret: string | undefined,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
  nowMs: number = Date.now(),
): SignatureResult {
  if (!secret || !timestamp || !signature) return "invalid";
  if (!/^\d{1,12}$/.test(timestamp)) return "invalid";
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > MAX_SKEW_SECONDS) return "invalid";
  if (!/^[0-9a-f]{64}$/i.test(signature)) return "invalid";
  const expected = Buffer.from(signBody(secret, timestamp, rawBody), "hex");
  const received = Buffer.from(signature, "hex");
  if (expected.length !== received.length) return "invalid";
  return timingSafeEqual(expected, received) ? "ok" : "invalid";
}

export function isAllowedPath(path: unknown): path is string {
  return typeof path === "string" && (STATIC_PATHS.has(path) || DYNAMIC_PATH.test(path));
}

export interface ParsedBody {
  paths: string[];
  tags: RevalidateTag[];
}

/** Devuelve el cuerpo validado o null si no cumple el tipo o la lista blanca. */
export function parseBody(rawBody: string): ParsedBody | null {
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { paths = [], tags = [], ...rest } = data as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return null;
  if (!Array.isArray(paths) || !Array.isArray(tags)) return null;
  if (paths.length > MAX_PATHS || tags.length > MAX_TAGS) return null;
  if (paths.length === 0 && tags.length === 0) return null;
  if (!paths.every(isAllowedPath)) return null;
  if (!tags.every((t): t is RevalidateTag => (ALLOWED_TAGS as readonly unknown[]).includes(t))) return null;
  return { paths: [...new Set(paths)], tags: [...new Set(tags)] };
}
