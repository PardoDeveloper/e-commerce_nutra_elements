import * as logger from "firebase-functions/logger";
import { paths } from "../common/db.js";
import { appError } from "../common/errors.js";
import { buildStatusResponse, type OrderStatusResponse } from "./public-view.js";
import { DUMMY_TOKEN_HASH, hashAccessToken, rateLimitKey, safeEqualHex } from "./primitives.js";
import { consumeRateLimit } from "./rate-limit.js";
import { orderAccessSchema, parseInput } from "./schemas.js";
import { parsePrivateSettings } from "./settings.js";
import { parseOrder, type OrderDoc } from "./types.js";
import type { Deps } from "./tx.js";

// getOrderStatus (functions.md 3.4). Exige número Y token: quien adivine un número no ve nada.

/** Cada cuánto, como máximo, se consulta a Flow para reconciliar un pago pendiente. */
export const RECONCILE_INTERVAL_MS = 15_000;

export interface GetStatusDeps extends Deps {
  /**
   * Reconciliación con Flow (la aplica `payments/`): consulta `getStatus` y ejecuta la misma rutina
   * transaccional que `flowConfirm`. Opcional: sin ella (p. ej. sin credenciales) se devuelve el
   * estado guardado. Nunca debe lanzar; si falla, se ignora.
   */
  reconcile?: ((order: OrderDoc) => Promise<void>) | undefined;
}

export interface GetStatusContext {
  ip?: string | undefined;
}

export function needsReconcile(order: OrderDoc, now: Date): boolean {
  if (order.paymentMethod !== "flow" || order.paymentStatus !== "pending_payment" || !order.flow?.token) return false;
  const last = order.flow.lastCheckedAt;
  return !last || now.getTime() - last.getTime() > RECONCILE_INTERVAL_MS;
}

export async function handleGetOrderStatus(deps: GetStatusDeps, data: unknown, ctx: GetStatusContext = {}): Promise<OrderStatusResponse> {
  const { db, clock } = deps;
  const { orderNumber, accessToken } = parseInput(orderAccessSchema, data);

  const settings = parsePrivateSettings(await db.get(paths.settingsPrivate));
  const { limits } = settings;

  // Límite por IP (cuenta todas las consultas).
  if (ctx.ip) {
    const ok = await consumeRateLimit(db, clock, rateLimitKey("getOrderStatus", ctx.ip), limits.orderStatusPerIpPer10Min);
    if (!ok) throw appError("RATE_LIMITED");
  } else {
    logger.warn("getOrderStatus sin IP: no se aplica el límite por IP");
  }

  // Siempre se hace el hash y la comparación, exista o no el pedido (mismo tiempo aproximado).
  const raw = await db.get(paths.order(orderNumber));
  const order = raw ? parseOrder(raw) : undefined;
  const matches = safeEqualHex(hashAccessToken(accessToken), order?.accessTokenHash ?? DUMMY_TOKEN_HASH) && order !== undefined;

  if (!order || !matches) {
    // Intentos fallidos por número: pasado el máximo, se responde RATE_LIMITED. Un token CORRECTO
    // nunca se bloquea por esto (con 256 bits de entropía no se puede adivinar; así nadie puede
    // dejar sin estado a un cliente repitiendo fallos sobre su número).
    const ok = await consumeRateLimit(db, clock, rateLimitKey("getOrderStatusFail", orderNumber), limits.orderStatusFailuresPerOrder);
    if (!ok) throw appError("RATE_LIMITED");
    throw appError("ORDER_NOT_FOUND");
  }

  let current = order;
  if (deps.reconcile && needsReconcile(order, clock())) {
    try {
      await deps.reconcile(order);
      const refreshed = await db.get(paths.order(orderNumber));
      if (refreshed) current = parseOrder(refreshed);
    } catch {
      logger.warn("Reconciliación con Flow fallida; se devuelve el estado guardado", { orderNumber });
    }
  }

  return buildStatusResponse(current, settings.bank);
}
