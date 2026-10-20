import { onCall, type CallableOptions, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { assertAdmin, callableSecurityOptions } from "../common/auth.js";
import { toHttpsError } from "../common/errors.js";
import { FLOW_SECRETS, getDeps, getFlowApiClient, makeCheckFlowPaid, makeReconcile } from "../payments/runtime.js";
import {
  handleCancelOrder,
  handleConfirmTransferPayment,
  handleRecordManualRefund,
  handleResolvePaymentReview,
  handleUpdateFulfillment,
} from "./admin-orders.js";
import { clientIpFrom } from "./client-ip.js";
import { handleCreateOrder } from "./create-order.js";
import { handleGetOrderStatus } from "./get-order-status.js";
import { releaseExpiredReservations as releaseExpired } from "./release-expired.js";
import type { Deps } from "./tx.js";

// Funciones de pedidos expuestas (functions.md 2, 3.1, 3.4, 4). Región us-east4 por
// `setGlobalOptions`. Los callables públicos y de admin usan App Check fuera del emulador.

function ipOf(request: CallableRequest<unknown>): string | undefined {
  const raw = request.rawRequest;
  return clientIpFrom(raw.headers, raw.ip);
}

/** Pedido nuevo: público + App Check. */
export const createOrder = onCall(
  { ...callableSecurityOptions(), memory: "256MiB", timeoutSeconds: 30, maxInstances: 10 },
  async (request) => {
    try {
      return await handleCreateOrder(getDeps(), request.data, { ip: ipOf(request) });
    } catch (err) {
      throw toHttpsError(err);
    }
  },
);

/** Estado público (número + token). Reconcilia con Flow si hace falta, por eso lleva los secretos. */
export const getOrderStatus = onCall(
  { ...callableSecurityOptions(), memory: "256MiB", timeoutSeconds: 20, maxInstances: 10, secrets: FLOW_SECRETS },
  async (request) => {
    try {
      const deps = getDeps();
      return await handleGetOrderStatus({ ...deps, reconcile: makeReconcile(deps, getFlowApiClient) }, request.data, { ip: ipOf(request) });
    } catch (err) {
      throw toHttpsError(err);
    }
  },
);

type AdminHandler<R> = (deps: Deps, data: unknown, uid: string) => Promise<R>;

function adminCallable<R>(options: CallableOptions, handler: AdminHandler<R>) {
  return onCall({ ...callableSecurityOptions(), ...options }, async (request: CallableRequest<unknown>): Promise<R> => {
    try {
      const uid = assertAdmin(request);
      return await handler(getDeps(), request.data, uid);
    } catch (err) {
      throw toHttpsError(err);
    }
  });
}

const ADMIN: CallableOptions = { memory: "256MiB", timeoutSeconds: 30, maxInstances: 5 };

export const confirmTransferPayment = adminCallable(ADMIN, handleConfirmTransferPayment);
export const resolvePaymentReview = adminCallable(ADMIN, handleResolvePaymentReview);
export const cancelOrder = adminCallable(ADMIN, handleCancelOrder);
export const updateFulfillment = adminCallable({ ...ADMIN, timeoutSeconds: 15 }, handleUpdateFulfillment);
export const recordManualRefund = adminCallable(ADMIN, handleRecordManualRefund);

/** Libera reservas vencidas cada 5 minutos (Cloud Scheduler existe solo en Blaze). */
export const releaseExpiredReservations = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Santiago",
    memory: "256MiB",
    timeoutSeconds: 120,
    maxInstances: 1,
    retryCount: 0,
    secrets: FLOW_SECRETS,
  },
  async () => {
    const deps = getDeps();
    await releaseExpired({ ...deps, checkFlowPaid: makeCheckFlowPaid(deps, getFlowApiClient) });
  },
);
