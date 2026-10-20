import type { DocData } from "../common/db.js";
import type { PricingResult } from "../common/pricing.js";
import type { CreateOrderRequest } from "../common/schemas.js";
import { sha256Hex } from "./primitives.js";
import type { StockChange, StockMap } from "./stock.js";
import type { PublicSettings } from "./settings.js";

// Piezas puras de `createOrder`: huella de idempotencia, reserva de stock, snapshot del pedido y
// respuesta (functions.md 3.1; data-model.md 2.3). Sin Firestore ni reloj.

/**
 * Huella del contenido del pedido (carrito, medio de pago, RUT y entrega) para la idempotencia:
 * el mismo `clientRequestId` con otro contenido es `INVALID_INPUT`. Es un hash; no guarda el RUT.
 */
export function requestFingerprint(req: CreateOrderRequest): string {
  const items = [...req.items].sort((a, b) => a.sku.localeCompare(b.sku)).map((i) => [i.sku, i.qty]);
  const delivery = req.delivery.type === "shipping" ? ["shipping", req.delivery.communeCode, req.delivery.address] : ["pickup"];
  return sha256Hex(JSON.stringify([items, req.paymentMethod, req.customer.rut, req.customer.email, delivery]));
}

/** Reserva: `stock -= qty`, `reserved += qty`, `inStock = (stock - qty) > 0`. Valida stock otra vez (defensa). */
export function planReserve(lines: readonly { sku: string; qty: number }[], products: StockMap): StockChange[] {
  return lines.map((line) => {
    const p = products.get(line.sku);
    if (!p || p.stock < line.qty) throw new Error("Reserva sin stock suficiente: debió validarse antes"); // no debería ocurrir
    return { sku: p.sku, stock: p.stock - line.qty, reserved: p.reserved + line.qty, inStock: p.stock - line.qty > 0 };
  });
}

export function buildOrderDoc(input: {
  orderNumber: string;
  number: number;
  req: CreateOrderRequest;
  pricing: PricingResult;
  settings: PublicSettings;
  now: Date;
  reservedUntil: Date;
  accessTokenHash: string;
}): DocData {
  const { orderNumber, number, req, pricing, settings, now, reservedUntil, accessTokenHash } = input;
  const delivery: DocData =
    pricing.delivery.type === "shipping" && req.delivery.type === "shipping"
      ? {
          type: "shipping",
          communeCode: pricing.delivery.communeCode,
          communeName: pricing.delivery.communeName,
          address: req.delivery.address,
          ...(req.delivery.notes !== undefined && req.delivery.notes.length > 0 ? { notes: req.delivery.notes } : {}),
        }
      : { type: "pickup", storeAddress: settings.pickup.address, storeHours: settings.pickup.hours };

  return {
    orderNumber,
    number,
    paymentMethod: req.paymentMethod,
    paymentStatus: "pending_payment",
    fulfillmentStatus: null,
    stockState: "reserved",
    reservedUntil,
    customer: {
      firstName: req.customer.firstName,
      lastName: req.customer.lastName,
      email: req.customer.email,
      phone: req.customer.phone,
      rut: req.customer.rut,
    },
    delivery,
    items: pricing.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      unitPrice: l.unitPrice,
      discount: l.discount,
      unitFinalPrice: l.unitFinalPrice,
      qty: l.qty,
      lineTotal: l.lineTotal,
    })),
    subtotal: pricing.subtotal,
    shipping: pricing.shipping,
    total: pricing.total,
    currency: "CLP",
    freeShippingApplied: pricing.freeShippingApplied,
    accessTokenHash,
    flow: null,
    transfer: null,
    refund: null,
    review: null,
    statusHistory: [{ at: now, kind: "payment", from: null, to: "pending_payment", by: "system" }],
    paidAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface CreateOrderResponse {
  orderNumber: string;
  accessToken: string;
  paymentMethod: "flow" | "transfer";
  paymentStatus: "pending_payment";
  subtotal: number;
  shipping: number;
  total: number;
  freeShippingApplied: boolean;
  items: { sku: string; name: string; unitFinalPrice: number; qty: number; lineTotal: number }[];
  reservedUntil: string;
  next: "pay_with_flow" | "show_transfer_instructions";
}

/** Respuesta a partir de lo que quedó guardado en el pedido (sirve también para el reintento idempotente). */
export function buildCreateResponse(
  order: {
    orderNumber: string;
    paymentMethod: "flow" | "transfer";
    subtotal: number;
    shipping: number;
    total: number;
    freeShippingApplied: boolean;
    items: readonly { sku: string; name: string; unitFinalPrice: number; qty: number; lineTotal: number }[];
    reservedUntil: Date;
  },
  accessToken: string,
): CreateOrderResponse {
  return {
    orderNumber: order.orderNumber,
    accessToken,
    paymentMethod: order.paymentMethod,
    paymentStatus: "pending_payment",
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    freeShippingApplied: order.freeShippingApplied,
    items: order.items.map((i) => ({ sku: i.sku, name: i.name, unitFinalPrice: i.unitFinalPrice, qty: i.qty, lineTotal: i.lineTotal })),
    reservedUntil: order.reservedUntil.toISOString(),
    next: order.paymentMethod === "flow" ? "pay_with_flow" : "show_transfer_instructions",
  };
}
