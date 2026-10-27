// Registro de ventas (/admin/ventas). Una venta es un pedido pagado (o pagado y luego reembolsado), fechado por
// `paidAt` en America/Santiago. Lógica pura: filtros, totales y comisión neta de reembolsos.
import { orderCommission, refundedCommission } from "./commission";
import { addDays, dayKey, previousMonth } from "./metrics";
import type { AdminOrder } from "./types";

export type SalePeriod = "month" | "lastMonth" | "30" | "all" | "custom";
export type SaleStatusFilter = "all" | "paid" | "refunded";

export interface SaleFilters {
  period: SalePeriod;
  /** `YYYY-MM-DD`, solo con `period === "custom"`. Vacío = sin límite. */
  from: string;
  to: string;
  status: SaleStatusFilter;
  method: "all" | AdminOrder["paymentMethod"];
  query: string;
}

export const DEFAULT_SALE_FILTERS: SaleFilters = { period: "month", from: "", to: "", status: "all", method: "all", query: "" };

export function isSale(o: AdminOrder): o is AdminOrder & { paidAt: string } {
  return o.paidAt !== null && (o.paymentStatus === "paid" || o.paymentStatus === "refunded");
}

export function units(o: Pick<AdminOrder, "items">): number {
  return o.items.reduce((s, it) => s + it.qty, 0);
}

/** Comisión que queda después de un reembolso (proporcional al monto devuelto). */
export function netCommission(o: AdminOrder): number {
  const gross = orderCommission(o);
  return o.paymentStatus === "refunded" && o.refund ? gross - refundedCommission(gross, o.refund.amount, o.total) : gross;
}

/** Venta neta: total pagado menos lo reembolsado. */
export function netTotal(o: AdminOrder): number {
  return o.total - (o.paymentStatus === "refunded" && o.refund ? o.refund.amount : 0);
}

/** Rango inclusivo de días del período (`null` = sin límite). */
export function periodRange(f: Pick<SaleFilters, "period" | "from" | "to">, today: string): { from: string | null; to: string | null } {
  const month = today.slice(0, 7);
  switch (f.period) {
    case "month":
      return { from: `${month}-01`, to: today };
    case "lastMonth": {
      const prev = previousMonth(month);
      return { from: `${prev}-01`, to: addDays(`${month}-01`, -1) };
    }
    case "30":
      return { from: addDays(today, -29), to: today };
    case "custom": {
      const [a, b] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
      return { from: a || null, to: b || null };
    }
    default:
      return { from: null, to: null };
  }
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Ventas que cumplen los filtros, de la más reciente a la más antigua. */
export function filterSales(orders: readonly AdminOrder[], f: SaleFilters, today: string): (AdminOrder & { paidAt: string })[] {
  const { from, to } = periodRange(f, today);
  const q = normalize(f.query.trim());
  return orders
    .filter(isSale)
    .filter((o) => {
      const day = dayKey(o.paidAt);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (f.status !== "all" && o.paymentStatus !== f.status) return false;
      if (f.method !== "all" && o.paymentMethod !== f.method) return false;
      if (q) {
        const text = `${o.orderNumber} ${o.customer.firstName} ${o.customer.lastName} ${o.customer.email} ${o.items.map((i) => `${i.sku} ${i.name}`).join(" ")}`;
        if (!normalize(text).includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export interface SalesTotals {
  count: number;
  units: number;
  /** Σ total neto de reembolsos (incluye envío). */
  revenue: number;
  /** Σ comisión neta. */
  commission: number;
}

export function salesTotals(sales: readonly AdminOrder[]): SalesTotals {
  return sales.reduce(
    (t, o) => ({ count: t.count + 1, units: t.units + units(o), revenue: t.revenue + netTotal(o), commission: t.commission + netCommission(o) }),
    { count: 0, units: 0, revenue: 0, commission: 0 },
  );
}
