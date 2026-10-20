import * as logger from "firebase-functions/logger";
import { paths } from "../common/db.js";
import { runTx } from "./apply-plan.js";
import { planReleaseOrder } from "./payment-plan.js";
import { readOrder, readStockMap, writeOrderPatch, writeStock, type Deps } from "./tx.js";
import { parseOrder, type OrderDoc, type StockProduct } from "./types.js";

// releaseExpiredReservations (functions.md 4.5). Libera las reservas vencidas, una transacción por
// pedido. Nunca toca un pedido que ya no esté `pending_payment` (pagado, en revisión, cancelado).

/** Pedidos por ejecución (cada 5 min; el resto queda para la siguiente). */
export const RELEASE_BATCH_LIMIT = 100;
/** Si Flow no responde, se espera hasta este tiempo después del vencimiento y luego se expira igual. */
export const FLOW_CHECK_GRACE_MS = 60 * 60_000;

export type FlowCheckResult = "paid_applied" | "not_paid" | "error";

export interface ReleaseDeps extends Deps {
  /**
   * Para un pedido de Flow con `flow.token`: consulta `getStatus` y, si ya está pagado, aplica la
   * rutina de pago (la misma de `flowConfirm`). `error` = Flow no respondió. Opcional.
   */
  checkFlowPaid?: ((order: OrderDoc) => Promise<FlowCheckResult>) | undefined;
}

export interface ReleaseSummary {
  scanned: number;
  expired: number;
  paidInstead: number;
  skipped: number;
  failed: number;
}

export async function releaseExpiredReservations(deps: ReleaseDeps): Promise<ReleaseSummary> {
  const { db, clock } = deps;
  const summary: ReleaseSummary = { scanned: 0, expired: 0, paidInstead: 0, skipped: 0, failed: 0 };
  const ids = await db.listExpiredPendingOrderIds(clock(), RELEASE_BATCH_LIMIT);
  summary.scanned = ids.length;

  for (const id of ids) {
    try {
      const result = await releaseOne(deps, id);
      summary[result]++;
    } catch (err) {
      // Un fallo en un pedido no impide procesar los demás.
      summary.failed++;
      logger.error("No se pudo liberar la reserva", { orderNumber: id, errorName: err instanceof Error ? err.name : typeof err });
    }
  }
  logger.info("Reservas vencidas procesadas", { ...summary });
  return summary;
}

async function releaseOne(deps: ReleaseDeps, orderNumber: string): Promise<"expired" | "paidInstead" | "skipped"> {
  const { db, clock } = deps;

  // Pre-lectura (fuera de la transacción) solo para decidir si hay que preguntar a Flow.
  const raw = await db.get(paths.order(orderNumber));
  if (!raw) return "skipped";
  const preview = parseOrder(raw);
  if (preview.paymentStatus !== "pending_payment") return "skipped";

  if (deps.checkFlowPaid && preview.paymentMethod === "flow" && preview.flow?.token) {
    const check = await deps.checkFlowPaid(preview);
    if (check === "paid_applied") return "paidInstead";
    if (check === "error" && clock().getTime() < preview.reservedUntil.getTime() + FLOW_CHECK_GRACE_MS) {
      logger.warn("Flow no respondió; se reintenta en la próxima ejecución", { orderNumber });
      return "skipped";
    }
  }

  return runTx(deps, async (tx) => {
    const order = await readOrder(tx, orderNumber);
    const now = clock();
    // Releer: solo si SIGUE pendiente, reservado y vencido (otra ejecución o un pago pudo adelantarse).
    if (!order || order.paymentStatus !== "pending_payment" || order.reservedUntil.getTime() > now.getTime()) return "skipped" as const;
    const products = order.stockState === "reserved" ? await readStockMap(tx, order.items) : new Map<string, StockProduct>();
    const release = planReleaseOrder({ order, products, now, actor: "system", to: "expired" });
    writeOrderPatch(tx, orderNumber, release.orderPatch);
    writeStock(tx, release.stock.changes, now);
    return "expired" as const;
  });
}
