import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { appError } from "../common/errors.js";
import type { DocData } from "../common/db.js";

// Tipos y lectura defensiva de los documentos que usan las funciones de pedidos (data-model.md
// 2.3). Los documentos se leen con zod (los datos pueden estar corruptos o a medio migrar); las
// escrituras son siempre "parches" de campos de primer nivel, así que lo que no se lee no se pierde.

export type PaymentMethod = "flow" | "transfer";
export type PaymentStatus = "pending_payment" | "paid" | "payment_review" | "expired" | "cancelled" | "refunded";
export type FulfillmentStatus = "preparing" | "ready_for_pickup" | "on_route" | "delivered";
export type StockState = "reserved" | "committed" | "released";
export type ReviewReason = "AMOUNT_MISMATCH" | "CURRENCY_MISMATCH" | "NO_STOCK_AFTER_EXPIRY" | "PAID_AFTER_CANCEL";

/** Máximo de entradas de `statusHistory` (data-model.md 2.3). */
export const MAX_STATUS_HISTORY = 50;

const discountSchema = z.object({ type: z.enum(["percent", "fixed"]), value: z.number() });

const itemSchema = z.object({
  sku: z.string(),
  name: z.string(),
  unitPrice: z.number(),
  discount: discountSchema.nullable().optional(),
  unitFinalPrice: z.number(),
  qty: z.number().int().min(1),
  lineTotal: z.number(),
});

const flowSchema = z.object({
  commerceOrder: z.string(),
  token: z.string(),
  flowOrder: z.number().nullable().optional(),
  paymentUrl: z.string(),
  attempt: z.number().int().min(1),
  createdAt: z.date().nullable().optional(),
  lastStatus: z.number().nullable().optional(),
  lastCheckedAt: z.date().nullable().optional(),
  paidAt: z.date().nullable().optional(),
  amountPaid: z.number().nullable().optional(),
  /** `flowOrder` del pago aceptado (campo adicional, ver handoff): detecta un segundo pago del mismo pedido. */
  paidFlowOrder: z.number().nullable().optional(),
});

const historyEntrySchema = z.looseObject({
  at: z.date(),
  kind: z.enum(["payment", "fulfillment", "stock"]),
  from: z.string().nullable(),
  to: z.string(),
  by: z.string(),
});

const deliverySchema = z.union([
  z.object({
    type: z.literal("shipping"),
    communeCode: z.string(),
    communeName: z.string(),
    address: z.string(),
    notes: z.string().nullable().optional(),
  }),
  z.object({ type: z.literal("pickup"), storeAddress: z.string(), storeHours: z.string() }),
]);

const orderSchema = z.object({
  orderNumber: z.string(),
  number: z.number().int(),
  paymentMethod: z.enum(["flow", "transfer"]),
  paymentStatus: z.enum(["pending_payment", "paid", "payment_review", "expired", "cancelled", "refunded"]),
  fulfillmentStatus: z.enum(["preparing", "ready_for_pickup", "on_route", "delivered"]).nullable(),
  stockState: z.enum(["reserved", "committed", "released"]),
  reservedUntil: z.date(),
  customer: z.object({ email: z.string() }),
  delivery: deliverySchema,
  items: z.array(itemSchema).min(1),
  subtotal: z.number().int(),
  shipping: z.number().int(),
  total: z.number().int(),
  currency: z.literal("CLP"),
  freeShippingApplied: z.boolean().default(false),
  accessTokenHash: z.string(),
  flow: flowSchema.nullable().optional(),
  review: z.looseObject({}).nullable().optional(),
  refund: z.looseObject({}).nullable().optional(),
  statusHistory: z.array(historyEntrySchema),
  paidAt: z.date().nullable().optional(),
  createdAt: z.date(),
});

export type OrderItem = z.output<typeof itemSchema>;
export type OrderFlow = z.output<typeof flowSchema>;
export type StatusEntry = z.output<typeof historyEntrySchema>;
export type OrderDoc = z.output<typeof orderSchema>;
export type OrderDelivery = z.output<typeof deliverySchema>;

/** Lee un pedido. Un documento corrupto es un error nuestro (`INTERNAL`), no del cliente. */
export function parseOrder(data: DocData): OrderDoc {
  const result = orderSchema.safeParse(data);
  if (!result.success) {
    // Se registra solo la ruta del campo, nunca el valor (puede traer datos personales).
    const paths = result.error.issues.slice(0, 5).map((i) => i.path.join("."));
    logger.error("Pedido con forma inesperada", { orderNumber: typeof data["orderNumber"] === "string" ? data["orderNumber"] : "?", paths });
    throw appError("INTERNAL");
  }
  return result.data;
}

// --- Productos (solo los campos de stock que se tocan aquí) ---

export interface StockProduct {
  sku: string;
  stock: number;
  reserved: number;
}

const stockProductSchema = z.object({
  stock: z.number().int().min(0),
  reserved: z.number().int().min(0).optional(),
  deletedAt: z.unknown().optional(),
});

/** Lee los campos de stock de un producto. Devuelve `undefined` si el documento no existe o es ilegible. */
export function parseStockProduct(sku: string, data: DocData | undefined): StockProduct | undefined {
  if (!data) return undefined;
  const result = stockProductSchema.safeParse(data);
  if (!result.success) return undefined;
  return { sku, stock: result.data.stock, reserved: result.data.reserved ?? 0 };
}

/** Elimina las claves con `undefined` (Firestore no las admite). Solo primer nivel. */
export function compact<T extends Record<string, unknown>>(obj: T): DocData {
  const out: DocData = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Agrega entradas al historial sin pasar de `MAX_STATUS_HISTORY` (conserva la primera y las más recientes). */
export function appendHistory(existing: readonly StatusEntry[], entries: readonly StatusEntry[]): StatusEntry[] {
  const all = [...existing, ...entries];
  if (all.length <= MAX_STATUS_HISTORY) return all;
  const [first, ...rest] = all;
  return first === undefined ? [] : [first, ...rest.slice(-(MAX_STATUS_HISTORY - 1))];
}
