import { appError } from "./errors.js";

// Métricas (D-012, D-025; data-model.md 2.6; functions.md 4.6 y 6). Lógica pura: calcula los
// incrementos que luego la Function aplica con `FieldValue.increment` dentro de su transacción.
// Aquí no hay Firestore ni reloj.

export const BUSINESS_TIME_ZONE = "America/Santiago";

export interface MetricsItem {
  sku: string;
  name: string;
  qty: number;
  lineTotal: number;
}

export interface DailyIncrements {
  ordersCount: number;
  revenue: number;
  merchandise: number;
  unitsSold: number;
  refundsCount: number;
  refundedAmount: number;
}

export interface ProductIncrements {
  sku: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export interface MetricsIncrements {
  /** `YYYY-MM-DD` (día de negocio de `paidAt`): id del documento de `metrics/daily/days/{date}`. */
  date: string;
  daily: DailyIncrements;
  /** Un elemento por SKU a modificar. Vacío si no hay cambios por producto. */
  products: ProductIncrements[];
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Fecha de negocio `YYYY-MM-DD` de un instante, en America/Santiago (horario de verano e invierno
 * de Chile incluidos, vía la base de zonas horarias de Node). Lanza `RangeError` si la fecha no es válida.
 */
export function businessDate(at: Date): string {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) throw new RangeError("Fecha no válida");
  const parts = dateFormatter.formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Ruta del documento diario. */
export function dailyMetricsPath(date: string): string {
  return `metrics/daily/days/${date}`;
}

/** Ruta del documento por producto. */
export function productMetricsPath(sku: string): string {
  return `metrics/products/items/${sku}`;
}

function sumQty(items: readonly MetricsItem[]): number {
  return items.reduce((acc, i) => acc + i.qty, 0);
}

// Evita `-0` al negar un cero (`increment(-0)` es inofensivo, pero ensucia los tests y los logs).
const neg = (n: number): number => (n === 0 ? 0 : -n);

/**
 * Incrementos al marcar un pedido como `paid` (una sola vez, en la transacción de la transición).
 * Diario: `ordersCount +1`, `revenue +total` (incluye envío), `merchandise +subtotal`,
 * `unitsSold +Σqty`. Por SKU: `unitsSold +qty`, `revenue +lineTotal`. El día es el de `paidAt`.
 */
export function paymentIncrements(order: {
  paidAt: Date;
  total: number;
  subtotal: number;
  items: readonly MetricsItem[];
}): MetricsIncrements {
  return {
    date: businessDate(order.paidAt),
    daily: {
      ordersCount: 1,
      revenue: order.total,
      merchandise: order.subtotal,
      unitsSold: sumQty(order.items),
      refundsCount: 0,
      refundedAmount: 0,
    },
    products: order.items.map((i) => ({ sku: i.sku, name: i.name, unitsSold: i.qty, revenue: i.lineTotal })),
  };
}

/**
 * Incrementos al reembolsar (D-025): una sola regla para reembolsos totales y parciales.
 * Diario, en el día de `paidAt` (NO el de `refundedAt`, para que el neto de ese día cuadre):
 *   revenue -= amount; refundsCount += 1; refundedAmount += amount;
 *   ordersCount y merchandise NO cambian;
 *   unitsSold -= Σqty solo si `restocked === true`.
 * Por SKU: unitsSold -= qty y revenue -= lineTotal solo si `restocked === true`.
 * Se usa `restocked` (lo que de verdad pasó), no `restock` (lo pedido): con `restock: true` pero
 * sin `stockState == "committed"`, el llamador pasa `restocked: false` y las unidades no se tocan.
 * Valida `amount` entero en 1..total (`INVALID_REFUND_AMOUNT`).
 */
export function refundIncrements(order: {
  paidAt: Date;
  total: number;
  items: readonly MetricsItem[];
  refund: { amount: number; restocked: boolean };
}): MetricsIncrements {
  const { amount, restocked } = order.refund;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > order.total) {
    throw appError("INVALID_REFUND_AMOUNT");
  }
  return {
    date: businessDate(order.paidAt),
    daily: {
      ordersCount: 0,
      revenue: neg(amount),
      merchandise: 0,
      unitsSold: restocked ? neg(sumQty(order.items)) : 0,
      refundsCount: 1,
      refundedAmount: amount,
    },
    products: restocked
      ? order.items.map((i) => ({ sku: i.sku, name: i.name, unitsSold: neg(i.qty), revenue: neg(i.lineTotal) }))
      : [],
  };
}

/**
 * Ticket promedio neto = revenue / ordersCount (data-model.md 2.6). Con 0 pedidos devuelve `null`
 * (el panel muestra "—"); nunca divide por cero. Redondeado al peso entero más cercano.
 */
export function averageTicket(revenue: number, ordersCount: number): number | null {
  if (!Number.isFinite(revenue) || !Number.isFinite(ordersCount) || ordersCount <= 0) return null;
  return Math.round(revenue / ordersCount);
}
