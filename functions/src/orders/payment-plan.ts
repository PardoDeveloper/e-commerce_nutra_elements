import type { DocData } from "../common/db.js";
import { paymentIncrements, type MetricsIncrements } from "../common/metrics.js";
import { planCommit, planRelease, planSellFromFreeStock, type StockChange, type StockMap, type StockPlan } from "./stock.js";
import { appendHistory, type OrderDoc, type ReviewReason, type StatusEntry } from "./types.js";

// Decisiones puras de las transiciones de pago (data-model.md 6.1; functions.md 3.3, 4.1 a 4.3 y
// 4.5). Reciben el pedido y los productos ya leídos y devuelven un PLAN (parche del pedido,
// cambios de stock y métricas). La capa transaccional solo lo aplica. Sin Firestore ni reloj.

export type ConfirmMode = "flow" | "accept_review";

export type MismatchReason = "AMOUNT_MISMATCH" | "CURRENCY_MISMATCH";

export interface ConfirmInput {
  order: OrderDoc;
  /** Productos del pedido ya leídos. Si falta alguno, no se toca su stock. */
  products: StockMap;
  now: Date;
  /** `flow` o el uid del admin. */
  actor: string;
  mode: ConfirmMode;
  /** Solo `flow`: el monto o la moneda de `getStatus` no coinciden con el pedido. */
  mismatch?: MismatchReason | undefined;
  note?: string | undefined;
  /** Campos extra del pedido que se agregan al parche cuando el resultado es `paid` o `review`. */
  extraPatch?: DocData | undefined;
}

export type NoopReason = "already_paid" | "already_review" | "refunded";

export type ConfirmPlan =
  | { kind: "noop"; reason: NoopReason }
  | { kind: "invalid" }
  | { kind: "out_of_stock"; sku: string; available: number }
  | { kind: "paid"; orderPatch: DocData; stock: StockPlan; metrics: MetricsIncrements; reReserved: boolean }
  | { kind: "review"; reason: ReviewReason; orderPatch: DocData };

const payEntry = (order: OrderDoc, now: Date, actor: string, to: string, note?: string): StatusEntry => ({
  at: now,
  kind: "payment",
  from: order.paymentStatus,
  to,
  by: actor,
  ...(note !== undefined ? { note } : {}),
});

/** ¿Hay que leer los productos para decidir? (evita lecturas inútiles en los casos sin stock). */
export function confirmNeedsProducts(order: OrderDoc, mode: ConfirmMode, mismatch: MismatchReason | undefined): boolean {
  if (mismatch !== undefined && mode === "flow") return false;
  if (mode === "flow") return order.paymentStatus === "pending_payment" || order.paymentStatus === "expired";
  return order.paymentStatus === "payment_review";
}

function reviewPlan(input: ConfirmInput, reason: ReviewReason): ConfirmPlan {
  const { order, now, actor } = input;
  return {
    kind: "review",
    reason,
    orderPatch: {
      paymentStatus: "payment_review",
      review: { reason, openedAt: now },
      statusHistory: appendHistory(order.statusHistory, [payEntry(order, now, actor, "payment_review", reason)]),
      updatedAt: now,
      ...(input.extraPatch ?? {}),
    },
  };
}

function paidPlan(input: ConfirmInput, stock: StockPlan, reReserved: boolean): ConfirmPlan {
  const { order, now, actor } = input;
  const entries: StatusEntry[] = [payEntry(order, now, actor, "paid", input.note)];
  if (reReserved) entries.push({ at: now, kind: "stock", from: "released", to: "committed", by: actor });
  entries.push({ at: now, kind: "fulfillment", from: null, to: "preparing", by: "system" });
  const reviewPatch: DocData =
    order.paymentStatus === "payment_review" && order.review
      ? {
          review: {
            ...order.review,
            resolvedBy: actor,
            resolvedAt: now,
            resolution: "accepted",
            ...(input.note !== undefined ? { note: input.note } : {}),
          },
        }
      : {};
  return {
    kind: "paid",
    orderPatch: {
      paymentStatus: "paid",
      fulfillmentStatus: "preparing",
      stockState: "committed",
      paidAt: now,
      statusHistory: appendHistory(order.statusHistory, entries),
      updatedAt: now,
      ...reviewPatch,
      ...(input.extraPatch ?? {}),
    },
    stock,
    metrics: paymentIncrements({ paidAt: now, total: order.total, subtotal: order.subtotal, items: order.items }),
    reReserved,
  };
}

/** Resuelve el stock de un pedido que pasa a `paid` según su `stockState`. */
function payWithStock(input: ConfirmInput, fallback: "review" | "error"): ConfirmPlan {
  const { order, products } = input;
  if (order.stockState === "reserved") return paidPlan(input, planCommit(order.items, products), false);
  if (order.stockState === "committed") return paidPlan(input, { changes: [], missing: [] }, false);
  // released: hay que volver a reservar y vender en la misma transacción.
  const sell = planSellFromFreeStock(order.items, products);
  if (sell.ok) return paidPlan(input, sell.plan, true);
  if (fallback === "error") return { kind: "out_of_stock", sku: sell.sku, available: sell.available };
  return reviewPlan(input, "NO_STOCK_AFTER_EXPIRY");
}

/**
 * Confirma un pago (Flow o aceptación de una revisión). Tabla de decisiones:
 *
 * | estado actual     | flow                                  | accept_review   |
 * |-------------------|---------------------------------------|-----------------|
 * | pending_payment   | monto mal -> review; si no, paid      | invalid         |
 * | expired           | monto mal -> review; re-reserva o review NO_STOCK | invalid |
 * | cancelled         | review PAID_AFTER_CANCEL (o el monto) | invalid         |
 * | payment_review    | noop                                  | paid o out_of_stock |
 * | paid              | noop                                  | invalid         |
 * | refunded          | noop (nunca vuelve a paid)            | invalid         |
 */
export function planPaymentConfirmation(input: ConfirmInput): ConfirmPlan {
  const { order, mode } = input;
  const status = order.paymentStatus;

  if (mode === "accept_review") {
    return status === "payment_review" ? payWithStock(input, "error") : { kind: "invalid" };
  }

  if (status === "paid") return { kind: "noop", reason: "already_paid" };

  // flow
  if (status === "payment_review") return { kind: "noop", reason: "already_review" };
  if (status === "refunded") return { kind: "noop", reason: "refunded" };
  if (status === "cancelled") return reviewPlan(input, input.mismatch ?? "PAID_AFTER_CANCEL");
  if (input.mismatch !== undefined) return reviewPlan(input, input.mismatch);
  return payWithStock(input, "review");
}

// --- Liberar (expirar o cancelar) ---

export interface ReleaseInput {
  order: OrderDoc;
  products: StockMap;
  now: Date;
  actor: string;
  to: "expired" | "cancelled";
  note?: string | undefined;
  extraPatch?: DocData | undefined;
}

export interface ReleasePlan {
  orderPatch: DocData;
  stock: StockPlan;
  /** `true` si había una reserva que devolver al stock. */
  stockReleased: boolean;
}

/**
 * Pasa un pedido a `expired` o `cancelled` y devuelve la reserva al stock SOLO si
 * `stockState == "reserved"` (así nunca se repone dos veces). El llamador valida antes que la
 * transición esté permitida.
 */
export function planReleaseOrder(input: ReleaseInput): ReleasePlan {
  const { order, products, now, actor, to } = input;
  const releasing = order.stockState === "reserved";
  const stock = releasing ? planRelease(order.items, products) : { changes: [] as StockChange[], missing: [] as string[] };
  const entries: StatusEntry[] = [payEntry(order, now, actor, to, input.note)];
  if (releasing) entries.push({ at: now, kind: "stock", from: "reserved", to: "released", by: actor });
  return {
    orderPatch: {
      paymentStatus: to,
      ...(releasing ? { stockState: "released" } : {}),
      statusHistory: appendHistory(order.statusHistory, entries),
      updatedAt: now,
      ...(input.extraPatch ?? {}),
    },
    stock,
    stockReleased: releasing,
  };
}

/** Transiciones de pago que `cancelOrder` permite: solo `pending_payment` (`cancelled` es idempotente). */
export function canCancel(status: OrderDoc["paymentStatus"]): "yes" | "already" | "no" {
  if (status === "pending_payment") return "yes";
  if (status === "cancelled") return "already";
  return "no";
}

/** Parche `review` al resolver una revisión con `cancel`. */
export function reviewResolutionPatch(order: OrderDoc, input: { resolution: "cancelled"; by: string; now: Date; note: string }): DocData {
  return {
    review: {
      ...(order.review ?? {}),
      resolvedBy: input.by,
      resolvedAt: input.now,
      resolution: input.resolution,
      note: input.note,
    },
  };
}
