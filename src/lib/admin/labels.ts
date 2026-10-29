// Etiquetas en español (data-model.md 6).
import type { FulfillmentStatus, PaymentMethod, PaymentStatus, RefundMethod } from "./types";

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending_payment: "Pago pendiente",
  paid: "Pagado",
  payment_review: "Pago en revisión",
  expired: "Expirado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  preparing: "En preparación",
  ready_for_pickup: "Listo para retirar",
  on_route: "En ruta",
  delivered: "Entregado",
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  flow: "Flow",
};

/** Cómo se devolvió el dinero de un reembolso (se registra a mano, fuera del sistema). */
export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  flow: "Flow",
  transfer: "Transferencia al cliente",
};

export const CATEGORY_LABELS: Record<string, string> = {
  vitaminas: "Vitaminas",
  magnesio: "Magnesio",
  minerales: "Minerales",
  "omega-3": "Omega 3",
  belleza: "Belleza",
  bienestar: "Bienestar",
};

/** Estado principal de un pedido para las listas: el logístico si está pagado. */
export function orderStatusLabel(o: { paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus | null }): string {
  if (o.paymentStatus === "paid" && o.fulfillmentStatus) return FULFILLMENT_LABELS[o.fulfillmentStatus];
  return PAYMENT_LABELS[o.paymentStatus];
}

const STOCK_LABELS: Record<string, string> = {
  reserved: "Reservado",
  committed: "Vendido",
  released: "Liberado",
};

/** Etiqueta de un código de estado de pago, logístico o de stock (null = "Sin estado"). */
export function statusLabel(code: string | null, kind: "payment" | "fulfillment" | "stock"): string {
  if (code === null) return "Sin estado";
  if (kind === "payment") return PAYMENT_LABELS[code as PaymentStatus] ?? code;
  if (kind === "fulfillment") return FULFILLMENT_LABELS[code as FulfillmentStatus] ?? code;
  return STOCK_LABELS[code] ?? code;
}
