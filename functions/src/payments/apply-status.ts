import * as logger from "firebase-functions/logger";
import { increment, paths, type DocData } from "../common/db.js";
import { appError } from "../common/errors.js";
import { applyConfirmPlan, runTx } from "../orders/apply-plan.js";
import { confirmNeedsProducts, planPaymentConfirmation, type MismatchReason } from "../orders/payment-plan.js";
import { parseCommerceOrder } from "../orders/primitives.js";
import { readStockMap, writeOrderPatch, type Deps } from "../orders/tx.js";
import { appendHistory, parseOrder, type OrderDoc, type StockProduct } from "../orders/types.js";
import { FlowStatus, type FlowPaymentStatus } from "./flow-client.js";

// Rutina transaccional compartida por `flowConfirm`, la reconciliación de `getOrderStatus` y
// `releaseExpiredReservations` (functions.md 3.3). La fuente de verdad es `getStatus` firmado: el
// cuerpo de la petición de Flow nunca se usa salvo para el `token`. Es idempotente: la transición
// a `paid` solo ocurre si el estado leído DENTRO de la transacción lo permite.

export type FlowOutcome = "paid" | "payment_review" | "pending" | "rejected" | "duplicate" | "ignored";

export type ApplyResult = { kind: "processed"; outcome: FlowOutcome; orderNumber: string } | { kind: "order_not_found" };

/** Token de Flow como ID de documento: sin `/` ni caracteres raros (lo valida también el HTTP). */
export const FLOW_TOKEN_REGEX = /^[A-Za-z0-9._-]{1,100}$/;

const TERMINAL_KEEP: ReadonlySet<string> = new Set<FlowOutcome>(["paid", "payment_review", "duplicate"]);

function mismatchOf(order: OrderDoc, status: FlowPaymentStatus): MismatchReason | undefined {
  if (status.currency !== "CLP") return "CURRENCY_MISMATCH";
  if (!Number.isFinite(status.amount) || status.amount !== order.total) return "AMOUNT_MISMATCH";
  return undefined;
}

export async function applyFlowStatus(deps: Deps, token: string, status: FlowPaymentStatus): Promise<ApplyResult> {
  if (!FLOW_TOKEN_REGEX.test(token)) throw appError("INVALID_INPUT");
  const parsedRef = parseCommerceOrder(status.commerceOrder);
  if (!parsedRef) return { kind: "order_not_found" };
  const { orderNumber, attempt } = parsedRef;

  return runTx(deps, async (tx): Promise<ApplyResult> => {
    // ---- Lecturas ----
    const [orderDoc, eventDoc] = await tx.getAll([paths.order(orderNumber), paths.paymentEvent(token)]);
    if (!orderDoc) return { kind: "order_not_found" };
    const order = parseOrder(orderDoc);
    // Solo pedidos de Flow con un intento creado por nosotros (el sufijo no puede superar el intento actual).
    if (order.paymentMethod !== "flow" || !order.flow || attempt > order.flow.attempt) return { kind: "order_not_found" };
    const now = deps.clock();
    const previousOutcome = typeof eventDoc?.["outcome"] === "string" ? (eventDoc["outcome"] as FlowOutcome) : undefined;
    const isCurrentToken = order.flow.token === token;

    let outcome: FlowOutcome;
    let orderPatch: DocData | undefined;
    let planWrites: ((now: Date) => void) | undefined;
    const warnings: string[] = [];

    if (status.status === FlowStatus.PAID) {
      const mismatch = mismatchOf(order, status);
      const paidFlow = order.flow.paidFlowOrder;
      const isSecondPayment = order.paymentStatus === "paid" && paidFlow != null && paidFlow !== status.flowOrder;

      const products = confirmNeedsProducts(order, "flow", mismatch) && !isSecondPayment
        ? await readStockMap(tx, order.items)
        : new Map<string, StockProduct>();

      const flowPatch = {
        ...order.flow,
        lastCheckedAt: now,
        ...(isCurrentToken ? { lastStatus: FlowStatus.PAID } : {}),
        paidAt: now,
        amountPaid: status.amount,
        paidFlowOrder: status.flowOrder,
      };
      const plan = planPaymentConfirmation({
        order,
        products,
        now,
        actor: "flow",
        mode: "flow",
        mismatch,
        extraPatch: { flow: flowPatch },
      });

      if (isSecondPayment) {
        // Segundo pago (otro `flowOrder`) de un pedido ya pagado: no cambia nada del pedido salvo, la
        // primera vez que llega, una anotación para revisión manual (reembolso a mano, F3).
        outcome = "duplicate";
        if (previousOutcome === undefined) {
          warnings.push("DUPLICATE_PAYMENT");
          orderPatch = {
            statusHistory: appendHistory(order.statusHistory, [
              { at: now, kind: "payment", from: "paid", to: "paid", by: "flow", note: "DUPLICATE_PAYMENT" },
            ]),
            updatedAt: now,
          };
        }
      } else if (plan.kind === "paid") {
        outcome = "paid";
        planWrites = (n) => applyConfirmPlan(tx, orderNumber, plan, n);
      } else if (plan.kind === "review") {
        outcome = "payment_review";
        planWrites = (n) => applyConfirmPlan(tx, orderNumber, plan, n);
      } else {
        // noop: pedido ya pagado (mismo pago), en revisión o reembolsado.
        outcome = previousOutcome ?? (plan.kind === "noop" && plan.reason === "already_paid" ? "paid" : "ignored");
      }
    } else if (status.status === FlowStatus.PENDING || status.status === FlowStatus.REJECTED || status.status === FlowStatus.CANCELLED) {
      outcome = status.status === FlowStatus.PENDING ? "pending" : "rejected";
      // Solo el intento vigente actualiza el estado del pedido (un intento viejo no pisa al nuevo).
      if (isCurrentToken && order.paymentStatus === "pending_payment") {
        orderPatch = { flow: { ...order.flow, lastStatus: status.status, lastCheckedAt: now }, updatedAt: now };
      }
    } else {
      outcome = "ignored";
    }

    // Un resultado final ya registrado para este token no se degrada (p. ej. "paid" -> "pending").
    if (previousOutcome !== undefined && TERMINAL_KEEP.has(previousOutcome) && outcome !== "duplicate") outcome = previousOutcome as FlowOutcome;

    // ---- Escrituras ----
    planWrites?.(now);
    if (orderPatch) writeOrderPatch(tx, orderNumber, orderPatch);
    tx.set(
      paths.paymentEvent(token),
      {
        token,
        orderNumber,
        flowOrder: status.flowOrder,
        flowStatus: status.status,
        amount: status.amount,
        outcome,
        receivedCount: increment(1),
        lastReceivedAt: now,
        ...(eventDoc ? {} : { firstReceivedAt: now }),
        ...(warnings.length > 0 ? { warnings } : {}),
      },
      { merge: true },
    );
    logger.info("Confirmación de Flow procesada", { orderNumber, outcome, flowStatus: status.status });
    return { kind: "processed", outcome, orderNumber };
  });
}
