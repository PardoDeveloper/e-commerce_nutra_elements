import { dailyMetricsPath, productMetricsPath, type MetricsIncrements } from "../common/metrics.js";
import { increment, type Tx } from "../common/db.js";

// Escritura de las métricas dentro de la transacción del pedido (D-012, D-025). Los incrementos los
// calcula `common/metrics.ts` (puro); aquí solo se traducen a `set(..., {merge: true})` con
// `increment`, que crea el documento si no existe y nunca necesita leerlo. Debe llamarse DESPUÉS de
// todas las lecturas de la transacción, y solo cuando el pedido cambia de estado (una vez).

export function writeMetrics(tx: Tx, inc: MetricsIncrements, now: Date): void {
  const d = inc.daily;
  tx.set(
    dailyMetricsPath(inc.date),
    {
      date: inc.date,
      ordersCount: increment(d.ordersCount),
      revenue: increment(d.revenue),
      merchandise: increment(d.merchandise),
      unitsSold: increment(d.unitsSold),
      refundsCount: increment(d.refundsCount),
      refundedAmount: increment(d.refundedAmount),
      updatedAt: now,
    },
    { merge: true },
  );
  for (const p of inc.products) {
    tx.set(
      productMetricsPath(p.sku),
      { sku: p.sku, name: p.name, unitsSold: increment(p.unitsSold), revenue: increment(p.revenue), updatedAt: now },
      { merge: true },
    );
  }
}
