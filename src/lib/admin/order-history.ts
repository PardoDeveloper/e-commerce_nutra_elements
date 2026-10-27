// Pedidos activos vs. historial (/admin/pedidos y /admin/pedidos/historial). Un pedido está CERRADO cuando ya no
// requiere acción: entregado, cancelado, reembolsado o expirado. Lógica pura: filtros y paginación.
import { addDays, dayKey } from "./metrics";
import type { AdminOrder } from "./types";

export type ClosedStatus = "delivered" | "cancelled" | "refunded" | "expired";
export const CLOSED_STATUSES: readonly ClosedStatus[] = ["delivered", "cancelled", "refunded", "expired"];

/** Estado de cierre del pedido, o null si sigue activo. */
export function closedStatus(o: Pick<AdminOrder, "paymentStatus" | "fulfillmentStatus">): ClosedStatus | null {
  if (o.paymentStatus === "cancelled" || o.paymentStatus === "refunded" || o.paymentStatus === "expired") return o.paymentStatus;
  if (o.paymentStatus === "paid" && o.fulfillmentStatus === "delivered") return "delivered";
  return null;
}

export function isActiveOrder(o: Pick<AdminOrder, "paymentStatus" | "fulfillmentStatus">): boolean {
  return closedStatus(o) === null;
}

export interface HistoryFilters {
  status: "all" | ClosedStatus;
  /** `YYYY-MM-DD` (America/Santiago), inclusivo, sobre la fecha del pedido. Vacío = sin límite. */
  from: string;
  to: string;
  query: string;
}

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = { status: "all", from: "", to: "", query: "" };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Pedidos cerrados que cumplen los filtros, del más reciente al más antiguo. */
export function filterHistory(orders: readonly AdminOrder[], f: HistoryFilters): AdminOrder[] {
  const q = normalize(f.query.trim());
  const [from, to] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
  return orders
    .filter((o) => {
      const status = closedStatus(o);
      if (status === null) return false;
      if (f.status !== "all" && status !== f.status) return false;
      if (from || to) {
        const day = dayKey(o.createdAt);
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      if (q && !normalize(`${o.orderNumber} ${o.customer.firstName} ${o.customer.lastName} ${o.customer.email}`).includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.number - a.number);
}

export function countByClosedStatus(orders: readonly AdminOrder[]): Record<ClosedStatus, number> {
  const counts: Record<ClosedStatus, number> = { delivered: 0, cancelled: 0, refunded: 0, expired: 0 };
  for (const o of orders) {
    const s = closedStatus(o);
    if (s) counts[s]++;
  }
  return counts;
}

export const PAGE_SIZE = 25;

export interface Page<T> {
  items: T[];
  /** Página actual (1..pages), ya acotada. */
  page: number;
  pages: number;
  /** Posición (1-based) del primer y último elemento mostrados; 0 si no hay. */
  from: number;
  to: number;
  total: number;
}

export function paginate<T>(list: readonly T[], page: number, size = PAGE_SIZE): Page<T> {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const items = list.slice(start, start + size);
  return { items, page: current, pages, from: items.length ? start + 1 : 0, to: start + items.length, total: list.length };
}

/** Números de página a mostrar, con "…" para los saltos: 1 … 4 5 6 … 12. */
export function pageNumbers(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1]! > 1) out.push("…");
    out.push(n);
  });
  return out;
}

// ---------- Historial paginado contra Firestore (solo Firebase; la demo filtra en memoria) ----------

/** Instante (ms) en que empieza el día `YYYY-MM-DD` en America/Santiago (también los días con cambio de hora). */
export function dayStartMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  // Chile está entre UTC-3 y UTC-4 y cambia de hora en horas exactas: el día empieza en una hora UTC exacta.
  for (let h = 0; h < 12; h++) {
    const t = Date.UTC(y, m - 1, d, h);
    if (dayKey(t) === key) return t;
  }
  return Date.UTC(y, m - 1, d);
}

/** Rango `[start, end)` de `createdAt` para los filtros de fecha (inclusivos), o null sin límite. */
export function historyDateRange(f: Pick<HistoryFilters, "from" | "to">): { start: number | null; end: number | null } {
  const [from, to] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
  return { start: from ? dayStartMs(from) : null, end: to ? dayStartMs(addDays(to, 1)) : null };
}

export type HistorySearch =
  | { kind: "none" }
  | { kind: "number"; orderNumber: string }
  | { kind: "email"; email: string }
  /** Texto libre (nombre): Firestore no busca por subcadena. */
  | { kind: "unsupported" };

/** Interpreta la búsqueda para Firestore: número de pedido exacto (`NE-000123`, `ne-123` o `123`) o correo completo. */
export function parseHistorySearch(query: string): HistorySearch {
  const q = query.trim();
  if (!q) return { kind: "none" };
  const num = /^(?:ne-?)?(\d{1,12})$/i.exec(q);
  if (num) {
    const n = Number(num[1]);
    return n > 0 ? { kind: "number", orderNumber: `NE-${String(n).padStart(6, "0")}` } : { kind: "unsupported" };
  }
  if (q.includes("@")) return { kind: "email", email: q.toLowerCase() };
  return { kind: "unsupported" };
}

export interface HistoryResult extends Page<AdminOrder> {
  /** La búsqueda no se puede hacer contra Firestore (solo número exacto o correo completo). */
  unsupportedQuery?: boolean;
}

/** Historial que se pide al servidor por páginas (Firebase). */
export interface OrderHistorySource {
  /** Pedidos cerrados por estado, sin filtros. */
  counts(): Promise<Record<ClosedStatus, number>>;
  page(filters: HistoryFilters, page: number): Promise<HistoryResult>;
}

export interface HistoryChunk<C> {
  items: AdminOrder[];
  /** Cursor del último documento leído (para `startAfter`), o null si no se leyó ninguno. */
  last: C | null;
}

/**
 * Paginación por cursores sobre una consulta ya filtrada y ordenada. Guarda las páginas leídas; saltar a una página
 * aún no leída trae de una vez las intermedias (`limit` de varias páginas desde el último cursor), porque Firestore
 * no tiene `offset` en el cliente.
 */
export function createHistoryPager<C>(
  fetchChunk: (after: C | null, count: number) => Promise<HistoryChunk<C>>,
  count: () => Promise<number>,
  size = PAGE_SIZE,
) {
  const pages: AdminOrder[][] = [];
  let cursor: C | null = null;
  let exhausted = false;
  let total: Promise<number> | null = null;

  // Las llamadas se encadenan: dos clics seguidos no deben leer ni guardar la misma página dos veces.
  let queue: Promise<unknown> = Promise.resolve();

  async function load(n: number): Promise<Page<AdminOrder>> {
    total ??= count();
    let all: number;
    try {
      all = await total;
    } catch (error) {
      total = null; // un error de red no debe quedar guardado: el siguiente intento vuelve a contar
      throw error;
    }
    const pageCount = Math.max(1, Math.ceil(all / size));
    const current = Math.min(Math.max(1, Math.floor(n) || 1), pageCount);
    if (pages.length < current && !exhausted) {
      const missing = current - pages.length;
      const chunk = await fetchChunk(cursor, missing * size);
      for (let i = 0; i < chunk.items.length; i += size) pages.push(chunk.items.slice(i, i + size));
      if (chunk.last !== null) cursor = chunk.last;
      if (chunk.items.length < missing * size) exhausted = true;
    }
    const items = pages[current - 1] ?? [];
    const start = (current - 1) * size;
    return { items, page: current, pages: pageCount, from: items.length ? start + 1 : 0, to: start + items.length, total: all };
  }

  return function page(n: number): Promise<Page<AdminOrder>> {
    const next = queue.then(() => load(n));
    queue = next.catch(() => undefined);
    return next;
  };
}
