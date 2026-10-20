// Descuento por producto (data-model.md 7.3). Función pura, igual que la del servidor.
import type { Clp, ProductDiscount } from "./types";

export function computeFinalPrice(price: Clp, discount: ProductDiscount | null): Clp {
  let final = price;
  if (discount?.type === "percent") final = Math.floor((price * (100 - discount.value) + 50) / 100);
  else if (discount?.type === "fixed") final = price - discount.value;
  return Math.max(0, Math.min(price, final));
}

/** Devuelve el código de error o null si el descuento es válido para ese precio. */
export function validateDiscount(price: Clp, discount: ProductDiscount): "INVALID_DISCOUNT" | "DISCOUNT_TOO_HIGH" | null {
  if (!Number.isInteger(discount.value)) return "INVALID_DISCOUNT";
  if (discount.type === "percent") return discount.value >= 1 && discount.value <= 99 ? null : "INVALID_DISCOUNT";
  if (discount.value < 1) return "INVALID_DISCOUNT";
  return discount.value < price ? null : "DISCOUNT_TOO_HIGH";
}
