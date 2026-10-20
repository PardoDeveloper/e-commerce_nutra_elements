import { createHmac } from "node:crypto";
import * as logger from "firebase-functions/logger";
import type { RevalidationPlan } from "./routes.js";

// Cliente de POST {SITE_URL}/api/revalidate (contrato functions.md, sección 8.2).

const REQUEST_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];

/** HMAC-SHA256 en hex de `${timestamp}.${cuerpoCrudo}` con el secreto compartido. */
export function signRevalidation(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Valida y normaliza `SITE_URL`. Devuelve `null` si falta o no es segura: el secreto solo viaja por HTTPS
 * (o por http a localhost en el emulador).
 */
export function normalizeSiteUrl(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (value.length === 0) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return `${url.origin}`;
  } catch {
    return null;
  }
}

export interface RevalidateDeps {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type RevalidateResult = "ok" | "skipped" | "failed";

/**
 * Envía la revalidación con reintento acotado (3 intentos, espera 0,5 s y 1,5 s) solo ante errores de
 * red, timeout, 429 o 5xx. Nunca lanza: un fallo se registra y el vencimiento normal de ISR lo corrige.
 * No registra el secreto, la firma ni la URL completa.
 */
export async function sendRevalidation(
  siteUrl: string | undefined,
  secret: string | undefined,
  plan: RevalidationPlan,
  source: string,
  deps: RevalidateDeps = {},
): Promise<RevalidateResult> {
  const base = normalizeSiteUrl(siteUrl);
  if (!base) {
    logger.warn("Revalidación omitida: SITE_URL no está configurada o no es segura", { source });
    return "skipped";
  }
  if (!secret) {
    logger.warn("Revalidación omitida: REVALIDATE_SECRET vacío", { source });
    return "skipped";
  }

  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => Date.now());

  const body = JSON.stringify({ paths: plan.paths, tags: plan.tags });
  let lastStatus: number | string = "sin respuesta";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Timestamp nuevo en cada intento: la ventana de validez del receptor es de 5 minutos.
    const timestamp = String(Math.floor(now() / 1000));
    try {
      const res = await fetchFn(`${base}/api/revalidate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ne-timestamp": timestamp,
          "x-ne-signature": signRevalidation(secret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        logger.info("Revalidación enviada", { source, paths: plan.paths.length, tags: plan.tags, attempt });
        return "ok";
      }
      lastStatus = res.status;
      // 4xx (salvo 429): el receptor rechazó la petición; reintentar no cambia nada.
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastStatus = err instanceof Error ? err.name : "error";
    }
    if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS[attempt - 1] ?? 1500);
  }

  logger.error("Revalidación fallida", { source, status: lastStatus, paths: plan.paths.length });
  return "failed";
}
