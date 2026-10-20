import type { OrderItem, StockProduct } from "./types.js";

// Cálculo puro de los cambios de stock de un pedido (data-model.md 6.1). Sin Firestore ni reloj.
// `stock` = unidades vendibles (ya descontadas las reservadas); `reserved` = unidades en pedidos
// con pago pendiente; `inStock = stock > 0`.

export interface StockChange {
  sku: string;
  stock: number;
  reserved: number;
  inStock: boolean;
}

export type StockMap = ReadonlyMap<string, StockProduct>;

export interface StockPlan {
  changes: StockChange[];
  /** SKU del pedido que no existen en `products` (se omiten; no se crean documentos fantasma). */
  missing: string[];
}

export type ReservePlan =
  | { ok: true; plan: StockPlan }
  | { ok: false; sku: string; available: number };

function mapItems(items: readonly OrderItem[], products: StockMap, fn: (p: StockProduct, qty: number) => StockChange): StockPlan {
  const changes: StockChange[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const product = products.get(item.sku);
    if (!product) missing.push(item.sku);
    else changes.push(fn(product, item.qty));
  }
  return { changes, missing };
}

/**
 * Reserva y vende de una vez (pago tardío sobre una reserva ya liberada): `stock -= qty`.
 * `reserved` no cambia porque la venta se confirma en la misma transacción. Falla si algún producto
 * no existe o no alcanza el stock (el llamador decide: `payment_review` o error).
 */
export function planSellFromFreeStock(items: readonly OrderItem[], products: StockMap): ReservePlan {
  for (const item of items) {
    const product = products.get(item.sku);
    if (!product) return { ok: false, sku: item.sku, available: 0 };
    if (product.stock < item.qty) return { ok: false, sku: item.sku, available: product.stock };
  }
  const plan = mapItems(items, products, (p, qty) => ({
    sku: p.sku,
    stock: p.stock - qty,
    reserved: p.reserved,
    inStock: p.stock - qty > 0,
  }));
  return { ok: true, plan };
}

/** Confirma la venta de lo reservado: `reserved -= qty`; `stock` no cambia (ya estaba descontado). */
export function planCommit(items: readonly OrderItem[], products: StockMap): StockPlan {
  return mapItems(items, products, (p, qty) => ({
    sku: p.sku,
    stock: p.stock,
    reserved: Math.max(0, p.reserved - qty),
    inStock: p.stock > 0,
  }));
}

/** Libera una reserva: `stock += qty`, `reserved -= qty`. */
export function planRelease(items: readonly OrderItem[], products: StockMap): StockPlan {
  return mapItems(items, products, (p, qty) => ({
    sku: p.sku,
    stock: p.stock + qty,
    reserved: Math.max(0, p.reserved - qty),
    inStock: p.stock + qty > 0,
  }));
}

/** Repone lo ya vendido (reembolso con `restock: true`): `stock += qty`; `reserved` no cambia. */
export function planRestock(items: readonly OrderItem[], products: StockMap): StockPlan {
  return mapItems(items, products, (p, qty) => ({
    sku: p.sku,
    stock: p.stock + qty,
    reserved: p.reserved,
    inStock: p.stock + qty > 0,
  }));
}

/** SKU de los ítems, para leer sus productos. */
export function itemPaths(items: readonly OrderItem[]): string[] {
  return items.map((i) => `products/${i.sku}`);
}
