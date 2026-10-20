import type { Bank } from "./settings.js";
import type { OrderDoc } from "./types.js";

// Vista pública de un pedido para `getOrderStatus` (functions.md 3.4). Función pura que ARMA la
// respuesta campo por campo (lista blanca): nunca se devuelve el documento ni se copia por
// extensión, así un campo nuevo del pedido no se filtra por accidente. No sale: correo, teléfono,
// dirección, notas, RUT, hash del token, datos de Flow, `refund` ni `statusHistory`.

export const TRACKING_NOTE = "Guarda tu número de pedido; con él puedes seguir tu despacho en DispatchTrack.";

export interface OrderStatusResponse {
  orderNumber: string;
  createdAt: string;
  paymentMethod: "flow" | "transfer";
  paymentStatus: OrderDoc["paymentStatus"];
  fulfillmentStatus: OrderDoc["fulfillmentStatus"];
  reservedUntil: string | null;
  delivery: { type: "shipping"; communeName: string } | { type: "pickup"; storeAddress: string; storeHours: string };
  items: { name: string; qty: number; lineTotal: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  transferInstructions?: {
    bankName: string;
    accountType: string;
    accountNumber: string;
    holderName: string;
    holderRut: string;
    contactEmail?: string;
    amount: number;
    reference: string;
  };
  trackingNote: string;
}

export function buildStatusResponse(order: OrderDoc, bank: Bank | undefined): OrderStatusResponse {
  const pending = order.paymentStatus === "pending_payment";
  const response: OrderStatusResponse = {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    reservedUntil: pending ? order.reservedUntil.toISOString() : null,
    delivery:
      order.delivery.type === "shipping"
        ? { type: "shipping", communeName: order.delivery.communeName }
        : { type: "pickup", storeAddress: order.delivery.storeAddress, storeHours: order.delivery.storeHours },
    items: order.items.map((i) => ({ name: i.name, qty: i.qty, lineTotal: i.lineTotal })),
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    trackingNote: TRACKING_NOTE,
  };
  if (order.paymentMethod === "transfer" && pending && bank) {
    response.transferInstructions = {
      bankName: bank.bankName,
      accountType: bank.accountType,
      accountNumber: bank.accountNumber,
      holderName: bank.holderName,
      holderRut: bank.holderRut,
      ...(bank.contactEmail !== undefined ? { contactEmail: bank.contactEmail } : {}),
      amount: order.total,
      reference: order.orderNumber,
    };
  }
  return response;
}
