import { paths, type Clock, type Db, type DocData, type Tx } from "../common/db.js";
import { appError } from "../common/errors.js";
import type { StockChange, StockMap } from "./stock.js";
import { parseOrder, parseStockProduct, type OrderDoc, type OrderItem, type StockProduct } from "./types.js";

// Ayudas de la capa transaccional compartidas por pedidos y pagos.

export interface Deps {
  db: Db;
  clock: Clock;
}

/** Lee y valida un pedido dentro de la transacción. `undefined` si no existe. */
export async function readOrder(tx: Tx, orderNumber: string): Promise<OrderDoc | undefined> {
  const data = await tx.get(paths.order(orderNumber));
  return data ? parseOrder(data) : undefined;
}

/** Como `readOrder`, pero lanza `ORDER_NOT_FOUND` si no existe. */
export async function requireOrder(tx: Tx, orderNumber: string): Promise<OrderDoc> {
  const order = await readOrder(tx, orderNumber);
  if (!order) throw appError("ORDER_NOT_FOUND");
  return order;
}

/** Lee los productos de los ítems. Los que no existen o son ilegibles no aparecen en el mapa. */
export async function readStockMap(tx: Tx, items: readonly OrderItem[]): Promise<Map<string, StockProduct>> {
  const docs = await tx.getAll(items.map((i) => paths.product(i.sku)));
  const map = new Map<string, StockProduct>();
  items.forEach((item, i) => {
    const p = parseStockProduct(item.sku, docs[i]);
    if (p) map.set(item.sku, p);
  });
  return map;
}

/** Escribe los cambios de stock (solo `stock`, `reserved`, `inStock`, `updatedAt`). */
export function writeStock(tx: Tx, changes: readonly StockChange[], now: Date): void {
  for (const c of changes) {
    tx.update(paths.product(c.sku), { stock: c.stock, reserved: c.reserved, inStock: c.inStock, updatedAt: now });
  }
}

export function writeOrderPatch(tx: Tx, orderNumber: string, patch: DocData): void {
  tx.update(paths.order(orderNumber), patch);
}

export type { StockMap };
