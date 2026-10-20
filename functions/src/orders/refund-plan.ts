import type { DocData } from "../common/db.js";
import { appError } from "../common/errors.js";
import { refundIncrements, type MetricsIncrements } from "../common/metrics.js";
import { planRestock, type StockMap, type StockPlan } from "./stock.js";
import { appendHistory, type OrderDoc, type StatusEntry } from "./types.js";

// Reembolso registrado a mano (functions.md 4.6; D-024 P5; D-025). Lógica pura. No mueve dinero:
// solo calcula qué se registra, qué stock se repone y cómo se ajustan las métricas.

/** Tolerancia para `refundedAt` en el futuro (relojes distintos). */
export const REFUND_FUTURE_TOLERANCE_MS = 5 * 60_000;

export interface RefundInput {
  amount: number;
  method: "flow" | "transfer";
  refundedAt: Date;
  note: string;
  restock: boolean;
}

export interface RefundPlan {
  orderPatch: DocData;
  stock: StockPlan;
  metrics: MetricsIncrements;
  /** Lo que de verdad pasó con el stock (no lo pedido). */
  restocked: boolean;
}

/** Valida monto y fecha. Lanza `INVALID_REFUND_AMOUNT` o `INVALID_REFUND_DATE`. */
export function validateRefund(order: OrderDoc, input: RefundInput, now: Date): void {
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > order.total) {
    throw appError("INVALID_REFUND_AMOUNT");
  }
  const at = input.refundedAt.getTime();
  if (Number.isNaN(at) || at > now.getTime() + REFUND_FUTURE_TOLERANCE_MS) throw appError("INVALID_REFUND_DATE");
  if (order.paidAt && at < order.paidAt.getTime()) throw appError("INVALID_REFUND_DATE");
}

/** El pedido debe estar `paid` (el llamador ya trató el caso `refunded` como idempotente). */
export function planRefund(input: { order: OrderDoc; products: StockMap; now: Date; uid: string; refund: RefundInput }): RefundPlan {
  const { order, products, now, uid, refund } = input;
  validateRefund(order, refund, now);
  if (!order.paidAt) throw appError("INTERNAL"); // un pedido pagado siempre tiene paidAt

  const restocked = refund.restock && order.stockState === "committed";
  const stock = restocked ? planRestock(order.items, products) : { changes: [], missing: [] };

  const entries: StatusEntry[] = [
    {
      at: now,
      kind: "payment",
      from: "paid",
      to: "refunded",
      by: uid,
      note: refund.note,
      refund: { amount: refund.amount, method: refund.method, restock: refund.restock },
    },
  ];
  if (restocked) entries.push({ at: now, kind: "stock", from: "committed", to: "released", by: uid });

  return {
    orderPatch: {
      paymentStatus: "refunded",
      refund: {
        amount: refund.amount,
        method: refund.method,
        refundedAt: refund.refundedAt,
        note: refund.note,
        restock: refund.restock,
        restocked,
        recordedBy: uid,
        recordedAt: now,
      },
      ...(restocked ? { stockState: "released" } : {}),
      statusHistory: appendHistory(order.statusHistory, entries),
      updatedAt: now,
    },
    stock,
    metrics: refundIncrements({
      paidAt: order.paidAt,
      total: order.total,
      items: order.items,
      refund: { amount: refund.amount, restocked },
    }),
    restocked,
  };
}
