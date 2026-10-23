import * as logger from "firebase-functions/logger";
import { paths } from "../common/db.js";
import { appError } from "../common/errors.js";
import { runTx } from "../orders/apply-plan.js";
import { hashAccessToken, safeEqualHex, commerceOrderFor, DUMMY_TOKEN_HASH } from "../orders/primitives.js";
import { orderAccessSchema, parseInput } from "../orders/schemas.js";
import { readOrder, type Deps } from "../orders/tx.js";
import { parseOrder, type OrderDoc } from "../orders/types.js";
import { applyFlowStatus } from "./apply-status.js";
import { buildReturnUrl, type FlowConfig } from "./config.js";
import { buildPaymentUrl, FlowApiError, FlowStatus, type FlowClient } from "./flow-client.js";

// createFlowPayment (functions.md 3.2). El monto sale de `order.total`; el cliente solo entrega
// número y token. Idempotente: si ya hay un intento pendiente se devuelve la misma URL.

/** Mínimo de `timeout` que se manda a Flow (segundos), para no mandar valores diminutos. */
export const MIN_FLOW_TIMEOUT_SECONDS = 60;

export interface CreatePaymentDeps extends Deps {
  getFlow: () => FlowClient | Promise<FlowClient>;
  getConfig: () => FlowConfig | Promise<FlowConfig>;
}

export interface CreateFlowPaymentResponse {
  redirectUrl: string;
  reservedUntil: string;
}

type Reuse = { reuse: true } | { reuse: false; nextAttempt: number };

/** ¿El intento guardado sigue vigente? Pregunta a Flow solo si no se conoce su estado. */
async function decideAttempt(deps: CreatePaymentDeps, order: OrderDoc): Promise<Reuse> {
  const flow = order.flow;
  if (!flow?.token) return { reuse: false, nextAttempt: 1 };

  let status: number | null | undefined = flow.lastStatus;
  if (status === null || status === undefined) {
    try {
      const fresh = await (await deps.getFlow()).getStatus(flow.token);
      status = fresh.status;
      if (fresh.status === FlowStatus.PAID) {
        // Ya está pagado en Flow aunque la confirmación no haya llegado: se aplica el pago y no se cobra otra vez.
        await applyFlowStatus(deps, flow.token, fresh);
        throw appError("ORDER_NOT_PAYABLE");
      }
    } catch (err) {
      if (err instanceof FlowApiError) {
        logger.warn("getStatus falló al decidir el reintento de pago; se reutiliza el intento guardado", { orderNumber: order.orderNumber });
        return { reuse: true };
      }
      throw err;
    }
  } else if (status === FlowStatus.PAID) {
    throw appError("ORDER_NOT_PAYABLE");
  }
  if (status === FlowStatus.REJECTED || status === FlowStatus.CANCELLED) return { reuse: false, nextAttempt: flow.attempt + 1 };
  return { reuse: true };
}

export async function handleCreateFlowPayment(deps: CreatePaymentDeps, data: unknown): Promise<CreateFlowPaymentResponse> {
  const { orderNumber, accessToken } = parseInput(orderAccessSchema, data);
  const { db, clock } = deps;

  const raw = await db.get(paths.order(orderNumber));
  const order = raw ? parseOrder(raw) : undefined;
  const tokenOk = safeEqualHex(hashAccessToken(accessToken), order?.accessTokenHash ?? DUMMY_TOKEN_HASH);
  if (!order || !tokenOk) throw appError("ORDER_NOT_FOUND"); // mismo error para "no existe" y "token incorrecto"

  if (order.paymentMethod !== "flow" || order.paymentStatus !== "pending_payment") throw appError("ORDER_NOT_PAYABLE");
  if (order.reservedUntil.getTime() <= clock().getTime()) throw appError("ORDER_EXPIRED");

  const decision = await decideAttempt(deps, order);
  if (decision.reuse && order.flow) {
    return { redirectUrl: order.flow.paymentUrl, reservedUntil: order.reservedUntil.toISOString() };
  }
  const attempt = decision.reuse ? 1 : decision.nextAttempt;

  let config: FlowConfig;
  let client: FlowClient;
  try {
    config = await deps.getConfig();
    client = await deps.getFlow();
  } catch (err) {
    logger.error("Configuración de Flow no válida", { errorName: err instanceof Error ? err.name : typeof err });
    throw appError("FLOW_UNAVAILABLE");
  }

  const now = clock();
  const remainingSeconds = Math.floor((order.reservedUntil.getTime() - now.getTime()) / 1000);
  const commerceOrder = commerceOrderFor(orderNumber, attempt);
  let created;
  try {
    created = await client.createPayment({
      commerceOrder,
      subject: `Pedido ${orderNumber} - Nutra Elements`,
      currency: "CLP",
      amount: order.total,
      email: order.customer.email,
      urlConfirmation: config.confirmationUrl,
      urlReturn: buildReturnUrl(config.siteUrl, orderNumber, accessToken),
      timeoutSeconds: Math.max(MIN_FLOW_TIMEOUT_SECONDS, remainingSeconds),
    });
  } catch (err) {
    if (err instanceof FlowApiError) {
      logger.error("payment/create falló", { orderNumber, kind: err.kind, httpStatus: err.httpStatus, flowCode: err.flowCode });
      throw appError("FLOW_UNAVAILABLE");
    }
    throw err;
  }
  const paymentUrl = buildPaymentUrl(created.url, created.token);

  // Guardar el intento. Si una llamada simultánea ya lo hizo, gana la primera y se devuelve esa URL.
  return runTx(deps, async (tx): Promise<CreateFlowPaymentResponse> => {
    const current = await readOrder(tx, orderNumber);
    if (!current) throw appError("ORDER_NOT_FOUND");
    if (current.paymentStatus !== "pending_payment") throw appError("ORDER_NOT_PAYABLE");
    if (current.flow && current.flow.attempt >= attempt && current.flow.token !== order.flow?.token) {
      return { redirectUrl: current.flow.paymentUrl, reservedUntil: current.reservedUntil.toISOString() };
    }
    const at = deps.clock();
    tx.update(paths.order(orderNumber), {
      flow: {
        commerceOrder,
        token: created.token,
        flowOrder: created.flowOrder,
        paymentUrl,
        attempt,
        createdAt: at,
        lastStatus: null,
        lastCheckedAt: null,
        paidAt: null,
        amountPaid: null,
        paidFlowOrder: null,
      },
      updatedAt: at,
    });
    logger.info("Pago de Flow creado", { orderNumber, attempt });
    return { redirectUrl: paymentUrl, reservedUntil: current.reservedUntil.toISOString() };
  });
}
