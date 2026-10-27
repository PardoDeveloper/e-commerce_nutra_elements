// Comisiones del químico por producto (data-model 2.1 `commissionPerUnit`, 2.3 `items[].commission`).
// Lógica pura. La comisión es un MONTO FIJO EN CLP POR UNIDAD vendida (no un porcentaje): la línea gana
// `commissionPerUnit × qty`. Se congela en el pedido al crearlo.

/** Tope de la comisión por unidad (igual que el precio máximo). */
export const MAX_COMMISSION = 10_000_000;

/** Comisión por unidad en CLP (entero 0..MAX). Un valor ausente o inválido es "sin definir" (null). */
export function readCommissionPerUnit(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_COMMISSION ? v : null;
}

/** Comisión de una línea. Sin monto (null) no hay comisión. */
export function lineCommission(qty: number, perUnit: number | null | undefined): number {
  if (perUnit === null || perUnit === undefined || !Number.isSafeInteger(perUnit) || perUnit <= 0) return 0;
  return perUnit * qty;
}

/** Comisión que se revierte en un reembolso: proporcional al monto devuelto sobre el total pagado. */
export function refundedCommission(orderCommission: number, amount: number, total: number): number {
  if (orderCommission <= 0 || total <= 0) return 0;
  return Math.min(orderCommission, Math.round((orderCommission * Math.min(amount, total)) / total));
}
