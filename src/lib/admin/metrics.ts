// Métricas del panel (data-model.md 2.6, regla de reembolsos D-025). Puro y determinista:
// calcula desde la lista de pedidos lo que en producción vendrá de `metrics/daily/days/*` y
// `metrics/products/items/*`.
import { orderCommission, refundedCommission } from "./commission";
import type { AdminOrder, DailyMetric, MetricsSummary, TopProduct } from "./types";

export const TIME_ZONE = "America/Santiago";
export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** `YYYY-MM-DD` en America/Santiago. */
export function dayKey(iso: string | number | Date): string {
  return dayFormatter.format(new Date(iso));
}

/** Suma `delta` días a una clave `YYYY-MM-DD` (aritmética en UTC, sin horario de verano). */
export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

/** Las `days` fechas que terminan en `todayKey`, de la más antigua a la más reciente. */
export function lastDays(todayKey: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(todayKey, i - (days - 1)));
}

function emptyDay(date: string): DailyMetric {
  return { date, ordersCount: 0, revenue: 0, merchandise: 0, unitsSold: 0, refundsCount: 0, refundedAmount: 0, commission: 0 };
}

/**
 * Agrega pedidos pagados (y luego reembolsados) por el día de `paidAt`. Reglas D-025:
 * `revenue -= refund.amount`; `ordersCount` y `merchandise` no cambian; las unidades bajan solo
 * si `refund.restocked`. Ticket promedio = revenue neto / pedidos.
 */
export function computeMetrics(orders: readonly AdminOrder[], range: number, todayKey: string): MetricsSummary {
  const keys = lastDays(todayKey, range);
  const byDay = new Map<string, DailyMetric>(keys.map((k) => [k, emptyDay(k)]));
  const bySku = new Map<string, TopProduct>();

  for (const order of orders) {
    if (!order.paidAt) continue;
    if (order.paymentStatus !== "paid" && order.paymentStatus !== "refunded") continue;
    const day = byDay.get(dayKey(order.paidAt));
    if (!day) continue;
    const units = order.items.reduce((sum, it) => sum + it.qty, 0);
    day.ordersCount += 1;
    day.revenue += order.total;
    day.merchandise += order.subtotal;
    day.unitsSold += units;
    const commission = orderCommission(order);
    day.commission += commission;
    for (const it of order.items) {
      const row = bySku.get(it.sku) ?? { sku: it.sku, name: it.name, unitsSold: 0, revenue: 0 };
      row.unitsSold += it.qty;
      row.revenue += it.lineTotal;
      bySku.set(it.sku, row);
    }
    if (order.paymentStatus === "refunded" && order.refund) {
      day.revenue -= order.refund.amount;
      day.refundsCount += 1;
      day.refundedAmount += order.refund.amount;
      day.commission -= refundedCommission(commission, order.refund.amount, order.total);
      if (order.refund.restocked) {
        day.unitsSold -= units;
        for (const it of order.items) {
          const row = bySku.get(it.sku);
          if (row) {
            row.unitsSold -= it.qty;
            row.revenue -= it.lineTotal;
          }
        }
      }
    }
  }

  const days = keys.map((k) => byDay.get(k) ?? emptyDay(k));
  const sales = days.reduce((s, d) => s + d.revenue, 0);
  const ordersCount = days.reduce((s, d) => s + d.ordersCount, 0);
  const top = [...bySku.values()]
    .filter((p) => p.unitsSold > 0)
    .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue || a.sku.localeCompare(b.sku))
    .slice(0, 10);

  return {
    days,
    sales,
    orders: ordersCount,
    averageTicket: ordersCount > 0 ? Math.round(sales / ordersCount) : 0,
    refundsCount: days.reduce((s, d) => s + d.refundsCount, 0),
    refundedAmount: days.reduce((s, d) => s + d.refundedAmount, 0),
    commission: days.reduce((s, d) => s + d.commission, 0),
    top,
  };
}

/**
 * Resumen a partir de los agregados reales (`metrics/daily/days/*` y `metrics/products/items/*`, data-model 2.6).
 * Los días sin documento cuentan como 0. Ticket promedio = Σ revenue neto / Σ ordersCount.
 */
export function summarizeAggregates(
  aggregates: { days: readonly DailyMetric[]; top: readonly TopProduct[] },
  range: number,
  todayKey: string,
): MetricsSummary {
  const byDate = new Map(aggregates.days.map((d) => [d.date, d] as const));
  const days = lastDays(todayKey, range).map((k) => byDate.get(k) ?? emptyDay(k));
  const sales = days.reduce((s, d) => s + d.revenue, 0);
  const orders = days.reduce((s, d) => s + d.ordersCount, 0);
  return {
    days,
    sales,
    orders,
    averageTicket: orders > 0 ? Math.round(sales / orders) : 0,
    refundsCount: days.reduce((s, d) => s + d.refundsCount, 0),
    refundedAmount: days.reduce((s, d) => s + d.refundedAmount, 0),
    commission: days.reduce((s, d) => s + d.commission, 0),
    top: aggregates.top.filter((p) => p.unitsSold > 0).slice(0, 10),
  };
}

/** `YYYY-MM` del mes anterior a `month`. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Suma de comisiones de los días de un mes (`YYYY-MM`). */
export function monthCommission(days: readonly DailyMetric[], month: string): number {
  return days.reduce((s, d) => (d.date.startsWith(`${month}-`) ? s + d.commission : s), 0);
}
