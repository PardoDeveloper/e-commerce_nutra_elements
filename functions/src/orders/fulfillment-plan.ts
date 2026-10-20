import type { DocData } from "../common/db.js";
import { appError } from "../common/errors.js";
import { appendHistory, type FulfillmentStatus, type OrderDoc, type StatusEntry } from "./types.js";

// Transiciones del estado logístico (data-model.md 6.2; functions.md 4.4). Lógica pura.

export type FulfillmentPlan =
  | { kind: "noop" }
  | { kind: "change"; direction: "forward" | "backward"; orderPatch: DocData };

type DeliveryType = "shipping" | "pickup";

/** Siguiente estado hacia adelante desde `from` para ese tipo de entrega (`null` si no hay). */
function forwardTargets(from: FulfillmentStatus, type: DeliveryType): FulfillmentStatus[] {
  if (from === "preparing") return [type === "pickup" ? "ready_for_pickup" : "on_route"];
  if (from === "ready_for_pickup" && type === "pickup") return ["delivered"];
  if (from === "on_route" && type === "shipping") return ["delivered"];
  return [];
}

/** Un único paso hacia atrás desde `from`. */
function backwardTargets(from: FulfillmentStatus, type: DeliveryType): FulfillmentStatus[] {
  if (from === "delivered") return [type === "pickup" ? "ready_for_pickup" : "on_route"];
  if (from === "ready_for_pickup" || from === "on_route") return ["preparing"];
  return [];
}

export function planFulfillment(input: {
  order: OrderDoc;
  to: FulfillmentStatus;
  note?: string | undefined;
  reason?: string | undefined;
  now: Date;
  uid: string;
}): FulfillmentPlan {
  const { order, to, note, reason, now, uid } = input;
  if (order.paymentStatus !== "paid") throw appError("ORDER_NOT_PAID");
  const from = order.fulfillmentStatus;
  if (from === null) throw appError("INVALID_TRANSITION");
  if (from === to) return { kind: "noop" };

  const type = order.delivery.type;
  let direction: "forward" | "backward";
  if (forwardTargets(from, type).includes(to)) direction = "forward";
  else if (backwardTargets(from, type).includes(to)) direction = "backward";
  else throw appError("INVALID_TRANSITION");

  if (direction === "backward" && (reason === undefined || reason.length === 0)) throw appError("REASON_REQUIRED");

  const entry: StatusEntry = {
    at: now,
    kind: "fulfillment",
    from,
    to,
    by: uid,
    ...(note !== undefined ? { note } : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(direction === "backward" ? { direction: "backward" as const } : {}),
  };
  return {
    kind: "change",
    direction,
    orderPatch: {
      fulfillmentStatus: to,
      statusHistory: appendHistory(order.statusHistory, [entry]),
      updatedAt: now,
    },
  };
}
