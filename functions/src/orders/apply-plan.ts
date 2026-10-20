import { ContentionError, type Tx } from "../common/db.js";
import { appError } from "../common/errors.js";
import { writeMetrics } from "../metrics/index.js";
import type { ConfirmPlan } from "./payment-plan.js";
import { writeOrderPatch, writeStock, type Deps } from "./tx.js";

/**
 * Aplica en la transacción el resultado de `planPaymentConfirmation`: parche del pedido, stock y,
 * solo al pasar a `paid`, las métricas. Llamar después de todas las lecturas.
 * Devuelve `true` si escribió algo.
 */
export function applyConfirmPlan(tx: Tx, orderNumber: string, plan: ConfirmPlan, now: Date): boolean {
  if (plan.kind === "paid") {
    writeOrderPatch(tx, orderNumber, plan.orderPatch);
    writeStock(tx, plan.stock.changes, now);
    writeMetrics(tx, plan.metrics, now);
    return true;
  }
  if (plan.kind === "review") {
    writeOrderPatch(tx, orderNumber, plan.orderPatch);
    return true;
  }
  return false;
}

/** Ejecuta una transacción y traduce el agotamiento de reintentos a `CONTENTION` del contrato. */
export async function runTx<T>(deps: Deps, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await deps.db.runTransaction(fn);
  } catch (err) {
    if (err instanceof ContentionError) throw appError("CONTENTION");
    throw err;
  }
}
