import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Piezas pequeñas y puras: token de acceso, número de pedido y ventanas de límite de intentos.

// --- Token de acceso (functions.md 3.1) ---

/** 32 bytes aleatorios en base64url (43 caracteres). Se entrega una sola vez; solo se guarda su hash. */
export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Token de acceso derivado del `clientRequestId` (UUID v4 que solo conoce el navegador que crea el
 * pedido): sha256 con separación de dominio, en base64url (43 caracteres). Así un reintento
 * idempotente de `createOrder` devuelve EL MISMO token sin guardarlo en claro y sin invalidar el que
 * el cliente ya recibió (M3, QA). La clave de idempotencia guardada es otro hash (`sha256(id)`), por
 * lo que no permite recuperar el token. Entropía: 122 bits del UUID v4.
 */
export function deriveAccessToken(clientRequestId: string): string {
  return createHash("sha256").update(`nutra-elements:order-access-token:v1:${clientRequestId}`, "utf8").digest("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashAccessToken(token: string): string {
  return sha256Hex(token);
}

/** Compara dos hashes hexadecimales en tiempo constante. Largos distintos -> `false`. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // Igual se hace una comparación para no variar el tiempo según el largo.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** Hash que se usa cuando el pedido no existe, para que el tiempo de respuesta no lo delate. */
export const DUMMY_TOKEN_HASH = sha256Hex("no-existe");

// --- Número de pedido (D-007) ---

export const ORDER_NUMBER_REGEX = /^NE-\d{6,}$/;

/** `NE-000123`. Si pasa de 999999 simplemente crece. */
export function formatOrderNumber(n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError("Número de pedido no válido");
  return `NE-${String(n).padStart(6, "0")}`;
}

export function isOrderNumber(value: unknown): value is string {
  return typeof value === "string" && ORDER_NUMBER_REGEX.test(value);
}

/** Quita el sufijo de reintento de Flow (`NE-000123-2` -> `{orderNumber: NE-000123, attempt: 2}`). */
export function parseCommerceOrder(commerceOrder: string): { orderNumber: string; attempt: number } | null {
  const match = /^(NE-\d{6,})(?:-(\d{1,3}))?$/.exec(commerceOrder);
  if (!match || match[1] === undefined) return null;
  const attempt = match[2] === undefined ? 1 : Number(match[2]);
  if (attempt < 1) return null;
  return { orderNumber: match[1], attempt };
}

/** `commerceOrder` que se manda a Flow: el número en el primer intento; `NE-000123-2` en los siguientes. */
export function commerceOrderFor(orderNumber: string, attempt: number): string {
  return attempt <= 1 ? orderNumber : `${orderNumber}-${attempt}`;
}

// --- Límites de intentos (ventana fija) ---

export interface RateWindow {
  count: number;
  windowStart: Date;
}

/** Clave del documento `rateLimits/{hash}`: nunca lleva la IP en claro. */
export function rateLimitKey(fn: string, identity: string): string {
  return sha256Hex(`${fn}:${identity}`);
}

/** Cuántos intentos van en la ventana vigente (0 si no hay estado o ya venció). */
export function currentCount(state: RateWindow | undefined, now: Date, windowMs: number): number {
  if (!state || now.getTime() - state.windowStart.getTime() >= windowMs) return 0;
  return state.count;
}

/**
 * Consume un intento. Si ya se alcanzó `max` en la ventana vigente, no permite y no cambia el estado.
 * Ventana fija: al vencer, empieza una nueva con `count = 1`.
 */
export function consumeAttempt(
  state: RateWindow | undefined,
  now: Date,
  windowMs: number,
  max: number,
): { allowed: boolean; next: RateWindow } {
  const count = currentCount(state, now, windowMs);
  if (state && count > 0) {
    if (count >= max) return { allowed: false, next: state };
    return { allowed: true, next: { count: count + 1, windowStart: state.windowStart } };
  }
  return { allowed: max >= 1, next: { count: 1, windowStart: now } };
}

/** Documento a escribir (`expiresAt` = política TTL de 1 día después de iniciar la ventana). */
export function rateLimitDoc(next: RateWindow): { count: number; windowStart: Date; expiresAt: Date } {
  return { count: next.count, windowStart: next.windowStart, expiresAt: new Date(next.windowStart.getTime() + 24 * 3600_000) };
}

export function readRateWindow(data: Record<string, unknown> | undefined): RateWindow | undefined {
  if (!data) return undefined;
  const { count, windowStart } = data;
  if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0 && windowStart instanceof Date) {
    return { count, windowStart };
  }
  return undefined;
}
