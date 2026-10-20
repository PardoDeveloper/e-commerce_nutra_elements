import { appError, type FieldError } from "./errors.js";

// Cálculo de precios, descuentos y envío de un pedido. Lógica pura, sin I/O (D-005: el servidor es
// la fuente de verdad del precio). Fórmulas: data-model.md 7.3 y 7.4; pasos: functions.md 3.1.
// Todo el dinero son CLP enteros.

export const MAX_ORDER_LINES = 20;
export const MAX_ORDER_TOTAL = 50_000_000;
const MAX_PRICE = 10_000_000;
const MAX_SHIPPING_FEE = 100_000;
const DEFAULT_MAX_QTY_PER_ITEM = 10;

export type ProductDiscount = { type: "percent" | "fixed"; value: number };

/** Campos de `products/{sku}` que usa el cálculo. `finalPrice` guardado se ignora a propósito. */
export interface PricingProduct {
  sku: string;
  name: string;
  price: number;
  discount?: ProductDiscount | null | undefined;
  published: boolean;
  active: boolean;
  stock: number;
}

/** Campos de `settings/public` que usa el cálculo. */
export interface PricingSettings {
  shippingFee: number;
  freeShippingThreshold: number | null;
  communes: readonly { code: string; name: string }[];
  pickup: { enabled: boolean };
  maxQtyPerItem?: number | undefined;
}

export type PricingDelivery = { type: "shipping"; communeCode: string } | { type: "pickup" };

export interface PricedLine {
  sku: string;
  name: string;
  unitPrice: number;
  discount: ProductDiscount | null;
  unitFinalPrice: number;
  qty: number;
  lineTotal: number;
}

export interface PricingResult {
  lines: PricedLine[];
  /** Σ unitPrice × qty (precio de lista, sin descuentos). */
  listSubtotal: number;
  /** Σ (unitPrice - unitFinalPrice) × qty. Siempre `listSubtotal - subtotal`. */
  discountTotal: number;
  /** Σ unitFinalPrice × qty (ya con descuentos). Es la base del umbral de envío gratis. */
  subtotal: number;
  shipping: number;
  total: number;
  freeShippingApplied: boolean;
  delivery: { type: "shipping"; communeCode: string; communeName: string } | { type: "pickup" };
}

export interface PricingInput {
  items: readonly { sku: string; qty: number }[];
  /** Productos leídos, por SKU. Un SKU ausente en el mapa se considera inexistente. */
  products: ReadonlyMap<string, PricingProduct>;
  settings: PricingSettings;
  delivery: PricingDelivery;
}

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n);
}

/**
 * Precio final unitario (data-model.md 7.3). Se recalcula desde `price` y `discount`; nunca se
 * confía en el `finalPrice` guardado.
 *   percent: floor((price * (100 - value) + 50) / 100)   -> entero más cercano, mitades hacia arriba
 *   fixed:   price - value
 *   siempre: max(0, min(price, resultado))
 * Datos corruptos (precio fuera de 1..10.000.000, descuento no entero) lanzan `INTERNAL`: es un
 * error de datos nuestro, no del cliente. Un descuento fijo mayor que el precio no es corrupto:
 * el contrato lo cubre con el tope en 0.
 */
export function computeFinalPrice(price: number, discount?: ProductDiscount | null): number {
  if (!isInt(price) || price < 1 || price > MAX_PRICE) throw appError("INTERNAL");
  if (discount === null || discount === undefined) return price;
  if (!isInt(discount.value) || discount.value < 0) throw appError("INTERNAL");

  let result: number;
  if (discount.type === "percent") {
    // Porcentajes fuera de 0..100 darían precios negativos o mayores al de lista: se acotan
    // abajo con el clamp final. Más de 100 se trata como 100 (precio 0 -> luego ZERO_TOTAL).
    const pct = Math.min(discount.value, 100);
    result = Math.floor((price * (100 - pct) + 50) / 100);
  } else if (discount.type === "fixed") {
    result = price - discount.value;
  } else {
    throw appError("INTERNAL");
  }
  return Math.max(0, Math.min(price, result));
}

/**
 * Umbral de envío gratis efectivo. Contrato: `null` = no hay envío gratis; si es entero,
 * 1..10.000.000. Un valor fuera de contrato (0, negativo, decimal) se IGNORA (sin envío gratis):
 * lo más seguro para el negocio, ya que un 0 regalaría el envío a todos.
 */
function effectiveThreshold(threshold: number | null): number | null {
  if (threshold === null) return null;
  return isInt(threshold) && threshold >= 1 && threshold <= MAX_PRICE ? threshold : null;
}

function validateItems(items: PricingInput["items"], maxQty: number): void {
  const fields: FieldError[] = [];
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ORDER_LINES) {
    throw appError("INVALID_INPUT", { fields: [{ path: "items", message: "Cantidad de líneas fuera de rango" }] });
  }
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (!isInt(item.qty) || item.qty < 1 || item.qty > maxQty) {
      fields.push({ path: `items.${i}.qty`, message: "Cantidad fuera de rango" });
    }
    if (seen.has(item.sku)) {
      // Contrato: SKUs distintos. Se rechaza en lugar de sumar cantidades (más seguro: el cliente
      // no debería enviarlos repetidos y sumarlos podría saltarse el tope por producto).
      fields.push({ path: `items.${i}.sku`, message: "SKU repetido" });
    }
    seen.add(item.sku);
  });
  if (fields.length > 0) throw appError("INVALID_INPUT", { fields });
}

/**
 * Calcula líneas, subtotal, descuento, envío y total de un pedido (functions.md 3.1, pasos 3 y 4).
 * Orden de las validaciones (el primer error gana):
 *  1. Ítems: 1..20 líneas, qty entera 1..maxQtyPerItem, SKU distintos -> `INVALID_INPUT`.
 *  2. Por producto, en el orden del carrito: inexistente, no publicado o inactivo
 *     -> `PRODUCT_UNAVAILABLE` (no se distingue la causa, para no filtrar datos);
 *     `stock < qty` -> `OUT_OF_STOCK` con `sku` y `available`.
 *  3. Entrega: comuna fuera de la lista -> `INVALID_COMMUNE`; retiro desactivado -> `PICKUP_DISABLED`.
 *  4. Total: `<= 0` -> `ZERO_TOTAL`; `> 50.000.000` -> `ORDER_TOO_LARGE`.
 * La verificación de stock aquí es la de lectura dentro de la transacción; el descuento del stock
 * lo hace el llamador (2B.4).
 */
export function computePricing(input: PricingInput): PricingResult {
  const { items, products, settings, delivery } = input;

  const maxQty =
    isInt(settings.maxQtyPerItem) && settings.maxQtyPerItem >= 1 && settings.maxQtyPerItem <= 100
      ? settings.maxQtyPerItem
      : DEFAULT_MAX_QTY_PER_ITEM;
  validateItems(items, maxQty);

  if (!isInt(settings.shippingFee) || settings.shippingFee < 0 || settings.shippingFee > MAX_SHIPPING_FEE) {
    throw appError("INTERNAL");
  }

  const lines: PricedLine[] = [];
  for (const item of items) {
    const product = products.get(item.sku);
    if (!product || product.published !== true || product.active !== true) {
      throw appError("PRODUCT_UNAVAILABLE", { sku: item.sku });
    }
    if (!(product.stock >= item.qty)) {
      const available = isInt(product.stock) && product.stock > 0 ? product.stock : 0;
      throw appError("OUT_OF_STOCK", { sku: item.sku, available });
    }
    const unitFinalPrice = computeFinalPrice(product.price, product.discount);
    lines.push({
      sku: item.sku,
      name: product.name,
      unitPrice: product.price,
      discount: product.discount ? { type: product.discount.type, value: product.discount.value } : null,
      unitFinalPrice,
      qty: item.qty,
      lineTotal: unitFinalPrice * item.qty,
    });
  }

  let resolvedDelivery: PricingResult["delivery"];
  if (delivery.type === "shipping") {
    const commune = settings.communes.find((c) => c.code === delivery.communeCode);
    if (!commune) throw appError("INVALID_COMMUNE");
    resolvedDelivery = { type: "shipping", communeCode: commune.code, communeName: commune.name };
  } else {
    if (settings.pickup.enabled !== true) throw appError("PICKUP_DISABLED");
    resolvedDelivery = { type: "pickup" };
  }

  const subtotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);
  const listSubtotal = lines.reduce((acc, l) => acc + l.unitPrice * l.qty, 0);
  const discountTotal = listSubtotal - subtotal;

  // Envío (data-model.md 7.4): retiro = 0; despacho = shippingFee; envío gratis si el umbral está
  // configurado y el subtotal CON descuentos es >= umbral (D-024 P11). En retiro no se marca
  // `freeShippingApplied`.
  let shipping = 0;
  let freeShippingApplied = false;
  if (resolvedDelivery.type === "shipping") {
    const threshold = effectiveThreshold(settings.freeShippingThreshold);
    if (threshold !== null && subtotal >= threshold) {
      freeShippingApplied = true;
    } else {
      shipping = settings.shippingFee;
    }
  }

  const total = subtotal + shipping;
  if (total <= 0) throw appError("ZERO_TOTAL");
  if (total > MAX_ORDER_TOTAL) throw appError("ORDER_TOO_LARGE");

  return { lines, listSubtotal, discountTotal, subtotal, shipping, total, freeShippingApplied, delivery: resolvedDelivery };
}
