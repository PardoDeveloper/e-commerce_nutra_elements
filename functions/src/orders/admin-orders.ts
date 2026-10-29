import * as logger from "firebase-functions/logger";
import { appError } from "../common/errors.js";
import { writeMetrics } from "../metrics/index.js";
import { applyConfirmPlan, runTx } from "./apply-plan.js";
import { planFulfillment } from "./fulfillment-plan.js";
import { canCancel, planPaymentConfirmation, planReleaseOrder, reviewResolutionPatch } from "./payment-plan.js";
import { planRefund, validateRefund } from "./refund-plan.js";
import {
  cancelOrderSchema,
  parseInput,
  recordRefundSchema,
  resolveReviewSchema,
  updateFulfillmentSchema,
} from "./schemas.js";
import { readStockMap, requireOrder, writeOrderPatch, writeStock, type Deps } from "./tx.js";
import type { StockProduct } from "./types.js";
import type { FulfillmentStatus, PaymentStatus } from "./types.js";

// Gestión de pedidos por el admin (functions.md 4.1 a 4.4 y 4.6). Cada función: valida la entrada
// y, en UNA transacción, lee (pedido, productos), decide con funciones puras y escribe. El estado
// leído dentro de la transacción decide, así repetir una llamada no repite efectos.

const noProducts = (): Map<string, StockProduct> => new Map();

// 4.1 confirmTransferPayment se eliminó: solo se paga con Flow (D-044).

// --- 4.2 resolvePaymentReview ---

export interface ResolveReviewResponse {
  orderNumber: string;
  paymentStatus: "paid" | "cancelled";
}

export async function handleResolvePaymentReview(deps: Deps, data: unknown, uid: string): Promise<ResolveReviewResponse> {
  const input = parseInput(resolveReviewSchema, data);
  return runTx(deps, async (tx): Promise<ResolveReviewResponse> => {
    const order = await requireOrder(tx, input.orderNumber);
    if (order.paymentStatus !== "payment_review") throw appError("INVALID_TRANSITION");
    const now = deps.clock();

    if (input.action === "accept") {
      const products = await readStockMap(tx, order.items);
      const plan = planPaymentConfirmation({ order, products, now, actor: uid, mode: "accept_review", note: input.note });
      if (plan.kind === "out_of_stock") throw appError("OUT_OF_STOCK", { sku: plan.sku, available: plan.available });
      if (plan.kind !== "paid") throw appError("INVALID_TRANSITION");
      applyConfirmPlan(tx, order.orderNumber, plan, now);
      return { orderNumber: order.orderNumber, paymentStatus: "paid" };
    }

    const products = order.stockState === "reserved" ? await readStockMap(tx, order.items) : noProducts();
    const release = planReleaseOrder({
      order,
      products,
      now,
      actor: uid,
      to: "cancelled",
      note: input.note,
      extraPatch: reviewResolutionPatch(order, { resolution: "cancelled", by: uid, now, note: input.note }),
    });
    writeOrderPatch(tx, order.orderNumber, release.orderPatch);
    writeStock(tx, release.stock.changes, now);
    return { orderNumber: order.orderNumber, paymentStatus: "cancelled" };
  });
}

// --- 4.3 cancelOrder ---

export interface CancelOrderResponse {
  orderNumber: string;
  paymentStatus: "cancelled";
  stockReleased: boolean;
}

export async function handleCancelOrder(deps: Deps, data: unknown, uid: string): Promise<CancelOrderResponse> {
  const input = parseInput(cancelOrderSchema, data);
  return runTx(deps, async (tx): Promise<CancelOrderResponse> => {
    const order = await requireOrder(tx, input.orderNumber);
    const verdict = canCancel(order.paymentStatus);
    if (verdict === "already") return { orderNumber: order.orderNumber, paymentStatus: "cancelled", stockReleased: false };
    if (verdict === "no") throw appError("INVALID_TRANSITION");

    const now = deps.clock();
    const products = order.stockState === "reserved" ? await readStockMap(tx, order.items) : noProducts();
    const release = planReleaseOrder({ order, products, now, actor: uid, to: "cancelled", note: input.reason });
    writeOrderPatch(tx, order.orderNumber, release.orderPatch);
    writeStock(tx, release.stock.changes, now);
    return { orderNumber: order.orderNumber, paymentStatus: "cancelled", stockReleased: release.stockReleased };
  });
}

// --- 4.4 updateFulfillment ---

export interface UpdateFulfillmentResponse {
  orderNumber: string;
  fulfillmentStatus: FulfillmentStatus;
  changed: boolean;
  direction: "forward" | "backward" | "none";
}

export async function handleUpdateFulfillment(deps: Deps, data: unknown, uid: string): Promise<UpdateFulfillmentResponse> {
  const input = parseInput(updateFulfillmentSchema, data);
  return runTx(deps, async (tx): Promise<UpdateFulfillmentResponse> => {
    const order = await requireOrder(tx, input.orderNumber);
    const now = deps.clock();
    const plan = planFulfillment({ order, to: input.to, note: input.note, reason: input.reason, now, uid });
    if (plan.kind === "noop") {
      return { orderNumber: order.orderNumber, fulfillmentStatus: input.to, changed: false, direction: "none" };
    }
    writeOrderPatch(tx, order.orderNumber, plan.orderPatch);
    return { orderNumber: order.orderNumber, fulfillmentStatus: input.to, changed: true, direction: plan.direction };
  });
}

// --- 4.6 recordManualRefund ---

export interface RecordRefundResponse {
  orderNumber: string;
  paymentStatus: "refunded";
  alreadyRefunded: boolean;
  restocked: boolean;
}

export async function handleRecordManualRefund(deps: Deps, data: unknown, uid: string): Promise<RecordRefundResponse> {
  const input = parseInput(recordRefundSchema, data);
  const refundedAt = new Date(input.refundedAt);
  return runTx(deps, async (tx): Promise<RecordRefundResponse> => {
    const order = await requireOrder(tx, input.orderNumber);
    const status: PaymentStatus = order.paymentStatus;

    // Ya reembolsado: no se escribe nada, aunque los parámetros difieran (idempotente).
    if (status === "refunded") {
      const restocked = order.refund?.["restocked"] === true;
      return { orderNumber: order.orderNumber, paymentStatus: "refunded", alreadyRefunded: true, restocked };
    }
    if (status !== "paid") throw appError("INVALID_TRANSITION");
    // B1 (QA): un pedido pagado por transferencia no pudo devolverse "por Flow". (Lo contrario es
    // válido: un pedido de Flow puede reembolsarse a mano por transferencia bancaria.)
    if (input.method === "flow" && order.paymentMethod !== "flow") throw appError("INVALID_INPUT");

    const now = deps.clock();
    const refund = { amount: input.amount, method: input.method, refundedAt, note: input.note, restock: input.restock };
    validateRefund(order, refund, now); // antes de leer productos: si falla, no se gasta ninguna lectura
    const needsStock = input.restock && order.stockState === "committed";
    const products = needsStock ? await readStockMap(tx, order.items) : noProducts();

    const plan = planRefund({ order, products, now, uid, refund });
    if (plan.stock.missing.length > 0) {
      logger.warn("Reembolso: productos inexistentes al reponer stock", { orderNumber: order.orderNumber, skus: plan.stock.missing });
    }
    writeOrderPatch(tx, order.orderNumber, plan.orderPatch);
    writeStock(tx, plan.stock.changes, now);
    writeMetrics(tx, plan.metrics, now);
    logger.info("Reembolso registrado", { orderNumber: order.orderNumber, amount: input.amount, restocked: plan.restocked });
    return { orderNumber: order.orderNumber, paymentStatus: "refunded", alreadyRefunded: false, restocked: plan.restocked };
  });
}
