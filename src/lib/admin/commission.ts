// Comisiones del químico (data-model 2.1 `commissionPerUnit` y 2.3 `items[].commission`). Lógica pura, calcada de
// functions/src/common/commission.ts. La comisión es un monto fijo en CLP por unidad vendida; se congela en el
// pedido al crearlo.
import type { AdminOrder } from "./types";

/** Tope de la comisión por unidad (igual que el precio máximo). */
export const MAX_COMMISSION = 10_000_000;

export function lineCommission(qty: number, perUnit: number | null | undefined): number {
  if (perUnit === null || perUnit === undefined || !Number.isSafeInteger(perUnit) || perUnit <= 0) return 0;
  return perUnit * qty;
}

/** Comisión que se revierte en un reembolso: proporcional al monto devuelto. */
export function refundedCommission(orderCommission: number, amount: number, total: number): number {
  if (orderCommission <= 0 || total <= 0) return 0;
  return Math.min(orderCommission, Math.round((orderCommission * Math.min(amount, total)) / total));
}

/** Comisión congelada de un pedido (suma de sus líneas). */
export function orderCommission(order: Pick<AdminOrder, "items">): number {
  return order.items.reduce((s, it) => s + it.commission, 0);
}

/**
 * "1.500" / "$1.500" / "1500" -> 1500. Vacío -> null (sin comisión). Solo pesos enteros.
 * Devuelve `undefined` si el texto no es válido.
 */
export function parseCommissionInput(text: string): number | null | undefined {
  const clean = text.replace(/[$\s.]/g, "");
  if (clean === "") return null;
  if (!/^\d{1,8}$/.test(clean)) return undefined;
  const value = Number(clean);
  return value <= MAX_COMMISSION ? value : undefined;
}

/** Valor inicial del campo: 1500 -> "1500"; null -> "". */
export function commissionToInput(perUnit: number | null): string {
  return perUnit === null ? "" : String(perUnit);
}
