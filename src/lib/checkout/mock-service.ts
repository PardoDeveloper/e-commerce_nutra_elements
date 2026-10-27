// Servicio de pedidos SIMULADO (prototipo, D-028). Implementa la misma interfaz que las
// Cloud Functions del contrato (`createOrder`, `createFlowPayment`, `getOrderStatus`); el
// estado vive en localStorage del navegador. Para pasar a producción se reemplaza la
// implementación por llamadas a las Functions y las pantallas no cambian.
//
// Privacidad: el pedido guardado NO contiene RUT, correo, teléfono ni dirección; solo lo
// necesario para mostrar la confirmación (igual que `getOrderStatus` del contrato).

import { normalizeRut } from "@/lib/rut";
import { computeSummary, type CatalogEntry } from "./summary";
import {
  OrderServiceError,
  type CreateFlowPaymentRequest,
  type CreateFlowPaymentResponse,
  type CreateOrderRequest,
  type CreateOrderResponse,
  type FulfillmentStatus,
  type GetOrderStatusRequest,
  type GetOrderStatusResponse,
  type OrderService,
  type PaymentMethod,
  type PaymentStatus,
  type TransferInstructions,
} from "./types";

export const ORDER_SEQ_KEY = "ne.orderSeq.v1";
export const ORDERS_KEY = "ne.orders.v1";
export const REQUESTS_KEY = "ne.orderReq.v1";

/** Reservas del contrato (D-006): 30 minutos con Flow, 48 horas con transferencia. */
export const RESERVATION_MINUTES: Record<PaymentMethod, number> = { flow: 30, transfer: 48 * 60 };

export const TRACKING_NOTE =
  "Guarda tu número de pedido; con él puedes seguir tu despacho en DispatchTrack.";

/** Datos bancarios DE PRUEBA. No son una cuenta real. */
export const TEST_BANK_DATA = {
  bankName: "Banco de Prueba",
  accountType: "Cuenta corriente",
  accountNumber: "000-00000-00",
  holderName: "Nutra Elements SpA (datos de prueba)",
  holderRut: "00.000.000-0",
} as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MockSettings {
  shippingFee: number;
  freeShippingThreshold: number | null;
  communes: readonly { code: string; name: string }[];
  pickup: { enabled: boolean; address: string; hours: string };
  maxQtyPerItem: number;
}

export interface MockServiceDeps {
  storage: StorageLike;
  /** Catálogo y ajustes actuales. Solo los necesita `createOrder`. */
  catalog?: Readonly<Record<string, CatalogEntry>>;
  settings?: MockSettings;
  now?: () => Date;
}

interface StoredOrder {
  orderNumber: string;
  accessToken: string;
  createdAt: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus | null;
  reservedUntil: string;
  delivery: GetOrderStatusResponse["delivery"];
  items: { sku: string; name: string; unitFinalPrice: number; qty: number; lineTotal: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  freeShippingApplied: boolean;
  flowAttempts: number;
  lastPaymentAttemptRejected: boolean;
}

export type SimulatedFlowResult = "approved" | "rejected";

/** Interfaz del contrato + el "botón" de la pantalla simulada de Flow. */
export interface MockOrderService extends OrderService {
  simulateFlowResult(request: GetOrderStatusRequest, result: SimulatedFlowResult): Promise<void>;
}

export function formatOrderNumber(sequence: number): string {
  return `NE-${String(sequence).padStart(6, "0")}`;
}

function readJson<T>(storage: StorageLike, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createMockOrderService(deps: MockServiceDeps): MockOrderService {
  const { storage } = deps;
  const now = deps.now ?? (() => new Date());

  const loadOrders = () => readJson<Record<string, StoredOrder>>(storage, ORDERS_KEY, {});
  const saveOrders = (orders: Record<string, StoredOrder>) => storage.setItem(ORDERS_KEY, JSON.stringify(orders));

  /** Misma respuesta si el número no existe o el token no coincide (contrato 3.4). */
  function findOrder(orderNumber: string, accessToken: string): StoredOrder {
    const order = loadOrders()[orderNumber];
    if (!order || order.accessToken !== accessToken) throw new OrderServiceError("ORDER_NOT_FOUND");
    return order;
  }

  function effectiveStatus(order: StoredOrder): PaymentStatus {
    if (order.paymentStatus === "pending_payment" && new Date(order.reservedUntil).getTime() <= now().getTime()) {
      return "expired";
    }
    return order.paymentStatus;
  }

  function toResponse(order: StoredOrder): CreateOrderResponse {
    return {
      orderNumber: order.orderNumber,
      accessToken: order.accessToken,
      paymentMethod: order.paymentMethod,
      paymentStatus: "pending_payment",
      subtotal: order.subtotal,
      shipping: order.shipping,
      total: order.total,
      freeShippingApplied: order.freeShippingApplied,
      items: order.items.map((i) => ({ sku: i.sku, name: i.name, unitFinalPrice: i.unitFinalPrice, qty: i.qty, lineTotal: i.lineTotal })),
      reservedUntil: order.reservedUntil,
      next: order.paymentMethod === "flow" ? "pay_with_flow" : "show_transfer_instructions",
    };
  }

  return {
    async createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
      const { catalog, settings } = deps;
      if (!catalog || !settings) throw new OrderServiceError("INTERNAL");

      // Idempotencia: la misma clave devuelve el mismo pedido.
      const requests = readJson<Record<string, string>>(storage, REQUESTS_KEY, {});
      const previous = requests[request.clientRequestId];
      if (previous) {
        const existing = loadOrders()[previous];
        if (existing) return toResponse(existing);
      }

      const items = request.items;
      const seen = new Set<string>();
      const fields: { path: string; message: string }[] = [];
      if (items.length < 1 || items.length > 20) fields.push({ path: "items", message: "Cantidad de líneas fuera de rango" });
      items.forEach((item, i) => {
        if (seen.has(item.sku)) fields.push({ path: `items.${i}.sku`, message: "SKU duplicado" });
        seen.add(item.sku);
        if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > settings.maxQtyPerItem) {
          fields.push({ path: `items.${i}.qty`, message: "Cantidad fuera de rango" });
        }
      });
      if (fields.length > 0) throw new OrderServiceError("INVALID_INPUT", { fields });

      if (request.customer.rut !== undefined && normalizeRut(request.customer.rut) === null) throw new OrderServiceError("INVALID_RUT", { fields: [{ path: "customer.rut", message: "RUT inválido" }] });

      let communeName = "";
      const delivery = request.delivery;
      if (delivery.type === "shipping") {
        const commune = settings.communes.find((c) => c.code === delivery.communeCode);
        if (!commune) throw new OrderServiceError("INVALID_COMMUNE");
        communeName = commune.name;
      } else if (!settings.pickup.enabled) {
        throw new OrderServiceError("PICKUP_DISABLED");
      }

      for (const item of items) {
        const entry = catalog[item.sku];
        if (!entry) throw new OrderServiceError("PRODUCT_UNAVAILABLE", { sku: item.sku });
        if (!entry.inStock) throw new OrderServiceError("OUT_OF_STOCK", { sku: item.sku });
      }

      const summary = computeSummary({
        items,
        catalog,
        settings: { shippingFee: settings.shippingFee, freeShippingThreshold: settings.freeShippingThreshold },
        delivery: delivery.type,
      });
      if (summary.total <= 0) throw new OrderServiceError("ZERO_TOTAL");

      // Número incremental NE-000001, NE-000002...
      const last = Number(storage.getItem(ORDER_SEQ_KEY) ?? "0");
      const sequence = (Number.isInteger(last) && last >= 0 ? last : 0) + 1;
      storage.setItem(ORDER_SEQ_KEY, String(sequence));
      const orderNumber = formatOrderNumber(sequence);

      const created = now();
      const reservedUntil = new Date(created.getTime() + RESERVATION_MINUTES[request.paymentMethod] * 60_000);
      const order: StoredOrder = {
        orderNumber,
        accessToken: randomToken(),
        createdAt: created.toISOString(),
        paymentMethod: request.paymentMethod,
        paymentStatus: "pending_payment",
        fulfillmentStatus: null,
        reservedUntil: reservedUntil.toISOString(),
        delivery:
          delivery.type === "shipping"
            ? { type: "shipping", communeName }
            : { type: "pickup", storeAddress: settings.pickup.address, storeHours: settings.pickup.hours },
        items: summary.lines.map((l) => ({ sku: l.sku, name: l.name, unitFinalPrice: l.unitFinalPrice, qty: l.qty, lineTotal: l.lineTotal })),
        subtotal: summary.subtotal,
        shipping: summary.shipping,
        total: summary.total,
        freeShippingApplied: summary.freeShippingApplied,
        flowAttempts: 0,
        lastPaymentAttemptRejected: false,
      };
      const orders = loadOrders();
      orders[orderNumber] = order;
      saveOrders(orders);
      requests[request.clientRequestId] = orderNumber;
      storage.setItem(REQUESTS_KEY, JSON.stringify(requests));
      return toResponse(order);
    },

    async createFlowPayment(request: CreateFlowPaymentRequest): Promise<CreateFlowPaymentResponse> {
      const order = findOrder(request.orderNumber, request.accessToken);
      if (order.paymentMethod !== "flow" || order.paymentStatus !== "pending_payment") throw new OrderServiceError("ORDER_NOT_PAYABLE");
      if (effectiveStatus(order) === "expired") throw new OrderServiceError("ORDER_EXPIRED");
      const orders = loadOrders();
      orders[order.orderNumber] = { ...order, flowAttempts: order.flowAttempts + 1 };
      saveOrders(orders);
      const query = new URLSearchParams({ o: order.orderNumber, t: order.accessToken });
      return { redirectUrl: `/checkout/flow-simulado?${query.toString()}`, reservedUntil: order.reservedUntil };
    },

    async getOrderStatus(request: GetOrderStatusRequest): Promise<GetOrderStatusResponse> {
      const order = findOrder(request.orderNumber, request.accessToken);
      const status = effectiveStatus(order);
      const pending = status === "pending_payment";
      const response: GetOrderStatusResponse = {
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        paymentMethod: order.paymentMethod,
        paymentStatus: status,
        fulfillmentStatus: order.fulfillmentStatus,
        reservedUntil: pending ? order.reservedUntil : null,
        delivery: order.delivery,
        items: order.items.map((i) => ({ name: i.name, qty: i.qty, lineTotal: i.lineTotal })),
        subtotal: order.subtotal,
        shipping: order.shipping,
        total: order.total,
        trackingNote: TRACKING_NOTE,
        lastPaymentAttemptRejected: order.lastPaymentAttemptRejected,
      };
      if (order.paymentMethod === "transfer" && pending) {
        const transfer: TransferInstructions = { ...TEST_BANK_DATA, amount: order.total, reference: order.orderNumber };
        response.transferInstructions = transfer;
      }
      return response;
    },

    async simulateFlowResult(request: GetOrderStatusRequest, result: SimulatedFlowResult): Promise<void> {
      const order = findOrder(request.orderNumber, request.accessToken);
      if (order.paymentMethod !== "flow" || order.paymentStatus !== "pending_payment") throw new OrderServiceError("ORDER_NOT_PAYABLE");
      if (effectiveStatus(order) === "expired") throw new OrderServiceError("ORDER_EXPIRED");
      const orders = loadOrders();
      orders[order.orderNumber] =
        result === "approved"
          ? {
              ...order,
              paymentStatus: "paid",
              fulfillmentStatus: order.delivery.type === "pickup" ? "ready_for_pickup" : "preparing",
              lastPaymentAttemptRejected: false,
            }
          : { ...order, lastPaymentAttemptRejected: true };
      saveOrders(orders);
    },
  };
}
