// Servicio de pedidos REAL: llama a las Cloud Functions del contrato (functions.md 3.1, 3.2 y 3.4).
// Misma interfaz `OrderService` que el simulado, así las pantallas no cambian. Solo navegador.
import { callFunction } from "@/lib/firebase/client";
import {
  ORDER_ERROR_MESSAGES,
  OrderServiceError,
  type CreateFlowPaymentResponse,
  type CreateOrderResponse,
  type GetOrderStatusResponse,
  type OrderErrorCode,
  type OrderService,
} from "./types";

/** Invoca una callable y devuelve `data`. */
export type OrderInvoker = (name: string, data: unknown) => Promise<unknown>;

const isOrderErrorCode = (code: unknown): code is OrderErrorCode => typeof code === "string" && code in ORDER_ERROR_MESSAGES;

/** Convierte el error de `httpsCallable` en `OrderServiceError` (los mensajes en español son los del contrato). */
export function mapOrderError(error: unknown): OrderServiceError {
  if (error instanceof OrderServiceError) return error;
  const e = typeof error === "object" && error !== null ? (error as { code?: unknown; details?: unknown }) : {};
  const details = typeof e.details === "object" && e.details !== null ? (e.details as Record<string, unknown>) : {};
  if (isOrderErrorCode(details.code)) {
    const fields = Array.isArray(details.fields)
      ? details.fields.flatMap((f) =>
          typeof f === "object" && f !== null && typeof (f as { path?: unknown }).path === "string"
            ? [{ path: (f as { path: string }).path, message: String((f as { message?: unknown }).message ?? "") }]
            : [],
        )
      : undefined;
    return new OrderServiceError(details.code, {
      ...(typeof details.sku === "string" ? { sku: details.sku } : {}),
      ...(fields ? { fields } : {}),
    });
  }
  const code = typeof e.code === "string" ? e.code.replace(/^functions\//, "") : "";
  if (code === "resource-exhausted") return new OrderServiceError("RATE_LIMITED");
  if (code === "aborted") return new OrderServiceError("CONTENTION");
  return new OrderServiceError("INTERNAL");
}

function record(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new OrderServiceError("INTERNAL");
  return v as Record<string, unknown>;
}

export function createFirebaseOrderService(invoke: OrderInvoker): OrderService {
  const call = async (name: string, data: unknown): Promise<Record<string, unknown>> => {
    try {
      return record(await invoke(name, data));
    } catch (error) {
      throw mapOrderError(error);
    }
  };
  return {
    async createOrder(request) {
      const r = await call("createOrder", request);
      if (typeof r.orderNumber !== "string" || typeof r.accessToken !== "string") throw new OrderServiceError("INTERNAL");
      return r as unknown as CreateOrderResponse;
    },
    async createFlowPayment(request) {
      const r = await call("createFlowPayment", { orderNumber: request.orderNumber, accessToken: request.accessToken });
      if (typeof r.redirectUrl !== "string" || !/^https:\/\//.test(r.redirectUrl)) throw new OrderServiceError("FLOW_UNAVAILABLE");
      return r as unknown as CreateFlowPaymentResponse;
    },
    async getOrderStatus(request) {
      const r = await call("getOrderStatus", { orderNumber: request.orderNumber, accessToken: request.accessToken });
      if (typeof r.paymentStatus !== "string") throw new OrderServiceError("INTERNAL");
      return r as unknown as GetOrderStatusResponse;
    },
  };
}

/** Timeouts del cliente (ms): un poco por encima del timeout de cada función. */
const TIMEOUTS: Record<string, number> = { createOrder: 35_000, createFlowPayment: 35_000, getOrderStatus: 25_000 };

export function createDefaultFirebaseOrderService(): OrderService {
  return createFirebaseOrderService((name, data) => callFunction(name, data, TIMEOUTS[name] ?? 30_000));
}
