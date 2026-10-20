// Máquina de estados del pedido (data-model.md 6) y reglas de las funciones de gestión
// (functions.md 4). Lógica pura: no toca stock ni métricas; devuelve `restockItems` /
// `releaseItems` para que el servicio simulado (o la Function real) los aplique.
import type { AdminOrder, FulfillmentStatus, RefundMethod, StatusHistoryEntry } from "./types";

export type OrderErrorCode =
  | "INVALID_TRANSITION"
  | "ORDER_NOT_TRANSFER"
  | "ORDER_NOT_PAID"
  | "REASON_REQUIRED"
  | "INVALID_REFUND_AMOUNT"
  | "INVALID_REFUND_DATE"
  | "INVALID_INPUT";

export type OrderResult =
  | { ok: true; order: AdminOrder; restockItems: boolean; releaseItems: boolean; changed: boolean; message?: string }
  | { ok: false; code: OrderErrorCode; message: string };

const fail = (code: OrderErrorCode, message: string): OrderResult => ({ ok: false, code, message });

type Logistics = Pick<AdminOrder, "paymentStatus" | "fulfillmentStatus" | "delivery">;

/** Siguiente estado logístico hacia adelante (null si no hay). */
export function nextFulfillment(order: Logistics): FulfillmentStatus | null {
  if (order.paymentStatus !== "paid") return null;
  switch (order.fulfillmentStatus) {
    case "preparing":
      return order.delivery.type === "pickup" ? "ready_for_pickup" : "on_route";
    case "ready_for_pickup":
    case "on_route":
      return "delivered";
    default:
      return null;
  }
}

/** Retroceso de un paso (solo admin, con motivo). */
export function previousFulfillment(order: Logistics): FulfillmentStatus | null {
  if (order.paymentStatus !== "paid") return null;
  switch (order.fulfillmentStatus) {
    case "delivered":
      return order.delivery.type === "pickup" ? "ready_for_pickup" : "on_route";
    case "ready_for_pickup":
    case "on_route":
      return "preparing";
    default:
      return null;
  }
}

export interface AllowedActions {
  confirmTransfer: boolean;
  cancel: boolean;
  advanceTo: FulfillmentStatus | null;
  backTo: FulfillmentStatus | null;
  refund: boolean;
}

/** Solo estas acciones se muestran en el detalle del pedido. */
export function allowedActions(order: AdminOrder): AllowedActions {
  const pendingLike = order.paymentStatus === "pending_payment" || order.paymentStatus === "expired";
  return {
    confirmTransfer: order.paymentMethod === "transfer" && pendingLike,
    cancel: order.paymentStatus === "pending_payment",
    advanceTo: nextFulfillment(order),
    backTo: previousFulfillment(order),
    refund: order.paymentStatus === "paid",
  };
}

function withHistory(order: AdminOrder, entries: StatusHistoryEntry[], at: string): AdminOrder {
  return { ...order, statusHistory: [...order.statusHistory, ...entries].slice(-50), updatedAt: at };
}

export function confirmTransferPayment(
  order: AdminOrder,
  input: { reference?: string; note?: string },
  ctx: { now: string; by: string; hasStock: boolean },
): OrderResult {
  if (order.paymentMethod !== "transfer") return fail("ORDER_NOT_TRANSFER", "El pedido no se paga por transferencia.");
  if (order.paymentStatus === "paid") {
    return { ok: true, order, restockItems: false, releaseItems: false, changed: false, message: "El pedido ya estaba pagado." };
  }
  if (order.paymentStatus !== "pending_payment" && order.paymentStatus !== "expired") {
    return fail("INVALID_TRANSITION", `No se puede confirmar un pedido en estado "${order.paymentStatus}".`);
  }
  if ((input.reference?.length ?? 0) > 100 || (input.note?.length ?? 0) > 300) {
    return fail("INVALID_INPUT", "Referencia o nota demasiado largas.");
  }
  const transfer = { confirmedBy: ctx.by, confirmedAt: ctx.now, reference: input.reference, note: input.note };
  if (order.paymentStatus === "expired" && !ctx.hasStock) {
    // El dinero ya se recibió pero no hay stock: queda en revisión (respuesta 200 con ese estado).
    const reviewed: AdminOrder = { ...order, paymentStatus: "payment_review", transfer };
    return {
      ok: true,
      order: withHistory(
        reviewed,
        [{ at: ctx.now, kind: "payment", from: order.paymentStatus, to: "payment_review", by: ctx.by, note: "NO_STOCK_AFTER_EXPIRY" }],
        ctx.now,
      ),
      restockItems: false,
      releaseItems: false,
      changed: true,
      message: "Sin stock tras la expiración: el pedido pasó a revisión de pago.",
    };
  }
  const paid: AdminOrder = {
    ...order,
    paymentStatus: "paid",
    fulfillmentStatus: "preparing",
    stockState: "committed",
    paidAt: ctx.now,
    transfer,
  };
  return {
    ok: true,
    order: withHistory(
      paid,
      [
        { at: ctx.now, kind: "payment", from: order.paymentStatus, to: "paid", by: ctx.by, note: input.note },
        { at: ctx.now, kind: "fulfillment", from: null, to: "preparing", by: "system" },
      ],
      ctx.now,
    ),
    restockItems: false,
    releaseItems: false,
    changed: true,
  };
}

export function cancelOrder(order: AdminOrder, reason: string, ctx: { now: string; by: string }): OrderResult {
  if (order.paymentStatus === "cancelled") {
    return { ok: true, order, restockItems: false, releaseItems: false, changed: false, message: "El pedido ya estaba cancelado." };
  }
  if (order.paymentStatus !== "pending_payment") {
    return fail(
      "INVALID_TRANSITION",
      `Solo se cancela un pedido con pago pendiente (estado actual: "${order.paymentStatus}"). Un pedido pagado se reembolsa.`,
    );
  }
  const trimmed = reason.trim();
  if (trimmed.length < 1 || trimmed.length > 300) return fail("INVALID_INPUT", "El motivo es obligatorio (1 a 300 caracteres).");
  const release = order.stockState === "reserved";
  const cancelled: AdminOrder = { ...order, paymentStatus: "cancelled", stockState: release ? "released" : order.stockState };
  return {
    ok: true,
    order: withHistory(cancelled, [{ at: ctx.now, kind: "payment", from: "pending_payment", to: "cancelled", by: ctx.by, reason: trimmed }], ctx.now),
    restockItems: false,
    releaseItems: release,
    changed: true,
  };
}

export function updateFulfillment(
  order: AdminOrder,
  to: FulfillmentStatus,
  input: { note?: string; reason?: string },
  ctx: { now: string; by: string },
): OrderResult {
  if (order.paymentStatus !== "paid") return fail("ORDER_NOT_PAID", "Solo un pedido pagado tiene estado logístico.");
  if (order.fulfillmentStatus === to) {
    return { ok: true, order, restockItems: false, releaseItems: false, changed: false, message: "Sin cambios." };
  }
  const forward = nextFulfillment(order) === to;
  const backward = previousFulfillment(order) === to;
  if (!forward && !backward) {
    return fail("INVALID_TRANSITION", `No se puede pasar de "${order.fulfillmentStatus}" a "${to}".`);
  }
  const reason = input.reason?.trim() ?? "";
  if (backward && (reason.length < 1 || reason.length > 300)) {
    return fail("REASON_REQUIRED", "Retroceder un estado exige un motivo (1 a 300 caracteres).");
  }
  if ((input.note?.length ?? 0) > 300) return fail("INVALID_INPUT", "La nota es demasiado larga.");
  const entry: StatusHistoryEntry = {
    at: ctx.now,
    kind: "fulfillment",
    from: order.fulfillmentStatus,
    to,
    by: ctx.by,
    ...(input.note ? { note: input.note } : {}),
    ...(backward ? { reason, direction: "backward" as const } : {}),
  };
  return {
    ok: true,
    order: withHistory({ ...order, fulfillmentStatus: to }, [entry], ctx.now),
    restockItems: false,
    releaseItems: false,
    changed: true,
  };
}

export interface RefundInput {
  amount: number;
  method: RefundMethod;
  /** ISO 8601 UTC. */
  refundedAt: string;
  note: string;
  restock: boolean;
}

const FIVE_MIN = 5 * 60 * 1000;

export function recordManualRefund(order: AdminOrder, input: RefundInput, ctx: { now: string; by: string }): OrderResult {
  if (order.paymentStatus === "refunded") {
    return { ok: true, order, restockItems: false, releaseItems: false, changed: false, message: "El pedido ya estaba reembolsado." };
  }
  if (order.paymentStatus !== "paid") {
    return fail("INVALID_TRANSITION", `Solo un pedido pagado se reembolsa (estado actual: "${order.paymentStatus}").`);
  }
  if (input.method !== "flow" && input.method !== "transfer") return fail("INVALID_INPUT", "Indica el medio del reembolso.");
  const note = input.note.trim();
  if (note.length < 1 || note.length > 300) return fail("INVALID_INPUT", "La nota es obligatoria (1 a 300 caracteres).");
  if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > order.total) {
    return fail("INVALID_REFUND_AMOUNT", `El monto debe ser un entero entre 1 y ${order.total}.`);
  }
  const refundedMs = Date.parse(input.refundedAt);
  if (Number.isNaN(refundedMs)) return fail("INVALID_REFUND_DATE", "La fecha del reembolso no es válida.");
  if (refundedMs > Date.parse(ctx.now) + FIVE_MIN) return fail("INVALID_REFUND_DATE", "La fecha del reembolso no puede ser futura.");
  if (order.paidAt && refundedMs < Date.parse(order.paidAt)) {
    return fail("INVALID_REFUND_DATE", "La fecha del reembolso no puede ser anterior al pago.");
  }

  const restocked = input.restock && order.stockState === "committed";
  const entries: StatusHistoryEntry[] = [
    {
      at: ctx.now,
      kind: "payment",
      from: "paid",
      to: "refunded",
      by: ctx.by,
      note,
      refund: { amount: input.amount, method: input.method, restock: input.restock },
    },
  ];
  if (restocked) entries.push({ at: ctx.now, kind: "stock", from: "committed", to: "released", by: ctx.by });
  const refunded: AdminOrder = {
    ...order,
    paymentStatus: "refunded",
    stockState: restocked ? "released" : order.stockState,
    refund: {
      amount: input.amount,
      method: input.method,
      refundedAt: new Date(refundedMs).toISOString(),
      note,
      restock: input.restock,
      restocked,
      recordedBy: ctx.by,
      recordedAt: ctx.now,
    },
  };
  return { ok: true, order: withHistory(refunded, entries, ctx.now), restockItems: restocked, releaseItems: false, changed: true };
}
