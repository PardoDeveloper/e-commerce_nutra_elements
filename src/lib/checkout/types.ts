// Interfaz del servicio de pedidos. Es IGUAL al contrato de las Cloud Functions
// (docs/team/contracts/functions.md 3.1, 3.2 y 3.4), para cambiar el simulado por las
// funciones reales sin tocar las pantallas. El cliente nunca envía precios (D-005).

export type Clp = number;
/** Solo Flow (D-044). */
export type PaymentMethod = "flow";
export type PaymentStatus = "pending_payment" | "paid" | "payment_review" | "expired" | "cancelled" | "refunded";
export type FulfillmentStatus = "preparing" | "ready_for_pickup" | "on_route" | "delivered";

export interface CreateOrderRequest {
  /** UUID v4 generado al abrir el intento de compra; clave de idempotencia. */
  clientRequestId: string;
  items: { sku: string; qty: number }[];
  paymentMethod: PaymentMethod;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    /** Opcional desde D-039: el checkout ya no lo pide. Si llega, el servidor valida el módulo 11. */
    rut?: string;
  };
  delivery: { type: "shipping"; communeCode: string; address: string; notes?: string } | { type: "pickup" };
}

export interface OrderLineView {
  sku: string;
  name: string;
  unitFinalPrice: Clp;
  qty: number;
  lineTotal: Clp;
}

export interface CreateOrderResponse {
  orderNumber: string;
  /** Token de acceso en claro; se entrega una sola vez. */
  accessToken: string;
  paymentMethod: PaymentMethod;
  paymentStatus: "pending_payment";
  subtotal: Clp;
  shipping: Clp;
  total: Clp;
  freeShippingApplied: boolean;
  items: OrderLineView[];
  reservedUntil: string;
  next: "pay_with_flow";
}

export interface CreateFlowPaymentRequest {
  orderNumber: string;
  accessToken: string;
}
export interface CreateFlowPaymentResponse {
  /** URL a la que se envía al navegador (en el simulado, una ruta interna). */
  redirectUrl: string;
  reservedUntil: string;
}

export interface GetOrderStatusRequest {
  orderNumber: string;
  accessToken: string;
}

export interface GetOrderStatusResponse {
  orderNumber: string;
  createdAt: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus | null;
  reservedUntil: string | null;
  delivery: { type: "shipping"; communeName: string } | { type: "pickup"; storeAddress: string; storeHours: string };
  items: { name: string; qty: number; lineTotal: Clp }[];
  subtotal: Clp;
  shipping: Clp;
  total: Clp;
  trackingNote: string;
  /**
   * EXTENSIÓN del prototipo (no está en el contrato): true si el último intento de pago con Flow
   * fue rechazado. En producción habría que exponerlo en `getOrderStatus` (pendiente con tech-lead).
   */
  lastPaymentAttemptRejected?: boolean;
}

/** Códigos de error del contrato (`details.code`). */
export type OrderErrorCode =
  | "INVALID_INPUT"
  | "INVALID_RUT"
  | "INVALID_COMMUNE"
  | "PICKUP_DISABLED"
  | "PRODUCT_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "ZERO_TOTAL"
  | "ORDER_TOO_LARGE"
  | "RATE_LIMITED"
  | "CONTENTION"
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_PAYABLE"
  | "ORDER_EXPIRED"
  | "FLOW_UNAVAILABLE"
  | "INTERNAL";

export const ORDER_ERROR_MESSAGES: Record<OrderErrorCode, string> = {
  INVALID_INPUT: "Revisa los datos del formulario.",
  INVALID_RUT: "Revisa tu RUT.",
  INVALID_COMMUNE: "Solo despachamos a comunas de la Región Metropolitana.",
  PICKUP_DISABLED: "El retiro en tienda no está disponible.",
  PRODUCT_UNAVAILABLE: "Un producto ya no está disponible.",
  OUT_OF_STOCK: "No hay stock suficiente de un producto.",
  ZERO_TOTAL: "No se puede procesar este pedido.",
  ORDER_TOO_LARGE: "No se puede procesar este pedido.",
  RATE_LIMITED: "Demasiados intentos o pedidos sin pagar con este correo. Intenta de nuevo en unos minutos.",
  CONTENTION: "El sistema está ocupado, intenta de nuevo.",
  ORDER_NOT_FOUND: "No encontramos el pedido. Revisa el número y el enlace.",
  ORDER_NOT_PAYABLE: "Este pedido ya no se puede pagar.",
  ORDER_EXPIRED: "La reserva de tus productos venció. Crea un pedido nuevo.",
  FLOW_UNAVAILABLE: "No pudimos conectar con Flow. Intenta de nuevo.",
  INTERNAL: "Ocurrió un error inesperado. Intenta de nuevo.",
};

/** Error del servicio (equivale al `HttpsError` con `details.code` de las Functions). */
export class OrderServiceError extends Error {
  readonly code: OrderErrorCode;
  /** SKU involucrado (PRODUCT_UNAVAILABLE / OUT_OF_STOCK). */
  readonly sku?: string;
  /** Errores por campo (INVALID_INPUT), con rutas como `customer.email`. */
  readonly fields?: { path: string; message: string }[];

  constructor(code: OrderErrorCode, extra?: { sku?: string; fields?: { path: string; message: string }[] }) {
    super(ORDER_ERROR_MESSAGES[code]);
    this.name = "OrderServiceError";
    this.code = code;
    if (extra?.sku !== undefined) this.sku = extra.sku;
    if (extra?.fields !== undefined) this.fields = extra.fields;
  }
}

/** Contrato del servicio. Hoy lo implementa `mockOrderService`; mañana, las Cloud Functions. */
export interface OrderService {
  createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse>;
  createFlowPayment(request: CreateFlowPaymentRequest): Promise<CreateFlowPaymentResponse>;
  getOrderStatus(request: GetOrderStatusRequest): Promise<GetOrderStatusResponse>;
}
