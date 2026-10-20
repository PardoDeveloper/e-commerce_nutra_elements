import { computeFinalPrice, type ProductDiscount } from "../common/pricing.js";
import type { ProductData, ProductPatch } from "./types.js";

// Descuentos y cambios de precio (data-model.md 7.3; functions.md 5, regla de DISCOUNT_REMOVED).

/**
 * `percent`: entero 1..99. `fixed`: entero >= 1 y menor que el precio (el precio final nunca llega
 * a 0). `DISCOUNT_TOO_HIGH` solo para el fijo que no cabe en ese precio.
 */
export function validateDiscount(price: number, discount: ProductDiscount): "INVALID_DISCOUNT" | "DISCOUNT_TOO_HIGH" | null {
  if (!Number.isSafeInteger(discount.value)) return "INVALID_DISCOUNT";
  if (discount.type === "percent") return discount.value >= 1 && discount.value <= 99 ? null : "INVALID_DISCOUNT";
  if (discount.type === "fixed") {
    if (discount.value < 1) return "INVALID_DISCOUNT";
    return discount.value < price ? null : "DISCOUNT_TOO_HIGH";
  }
  return "INVALID_DISCOUNT";
}

export function sameDiscount(a: ProductDiscount | null, b: ProductDiscount | null): boolean {
  if (a === null || b === null) return a === b;
  return a.type === b.type && a.value === b.value;
}

export interface PriceChange {
  patch: ProductPatch;
  /** El descuento fijo dejó de ser válido con el precio nuevo y se eliminó. */
  discountRemoved: boolean;
}

/**
 * Cambio de precio de un producto existente: recalcula `finalPrice` y elimina un descuento fijo
 * que deje de ser válido (la única vez que un lote toca un descuento). `null` si el precio no cambia.
 */
export function planPriceChange(product: ProductData, newPrice: number): PriceChange | null {
  if (product.price === newPrice) return null;
  const discountRemoved = product.discount !== null && validateDiscount(newPrice, product.discount) !== null;
  const discount = discountRemoved ? null : product.discount;
  const patch: ProductPatch = { price: newPrice, finalPrice: computeFinalPrice(newPrice, discount) };
  if (discountRemoved) patch.discount = null;
  return { patch, discountRemoved };
}

/** Stock disponible a partir del físico: lo reservado por pedidos pendientes ya no se puede vender. */
export function availableStock(physical: number, reserved: number): number {
  return Math.max(0, physical - reserved);
}
