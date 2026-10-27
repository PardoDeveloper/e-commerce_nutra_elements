import { describe, expect, it } from "vitest";
import {
  closedStatus,
  countByClosedStatus,
  createHistoryPager,
  dayStartMs,
  DEFAULT_HISTORY_FILTERS,
  filterHistory,
  historyDateRange,
  isActiveOrder,
  pageNumbers,
  paginate,
  parseHistorySearch,
} from "./order-history";
import { makeOrder } from "./testing";
import type { AdminOrder } from "./types";

const o = (number: number, over: Partial<AdminOrder>): AdminOrder =>
  makeOrder({ orderNumber: `NE-${String(number).padStart(6, "0")}`, number, createdAt: "2026-10-10T15:00:00.000Z", ...over });

const ALL = [
  o(1, { paymentStatus: "paid", fulfillmentStatus: "delivered" }),
  o(2, { paymentStatus: "cancelled", fulfillmentStatus: null, createdAt: "2026-09-20T15:00:00.000Z" }),
  o(3, { paymentStatus: "refunded", fulfillmentStatus: "delivered" }),
  o(4, { paymentStatus: "expired", fulfillmentStatus: null }),
  o(5, { paymentStatus: "paid", fulfillmentStatus: "on_route" }),
  o(6, { paymentStatus: "pending_payment", fulfillmentStatus: null }),
  o(7, { paymentStatus: "payment_review", fulfillmentStatus: null }),
];

const nums = (list: AdminOrder[]) => list.map((x) => x.number);

describe("activos vs. historial", () => {
  it("cerrados: entregado, cancelado, reembolsado (aunque se haya entregado) y expirado", () => {
    expect(ALL.map(closedStatus)).toEqual(["delivered", "cancelled", "refunded", "expired", null, null, null]);
    expect(nums(ALL.filter(isActiveOrder))).toEqual([5, 6, 7]);
  });

  it("el historial ordena del más reciente y filtra por estado, fecha y texto", () => {
    expect(nums(filterHistory(ALL, DEFAULT_HISTORY_FILTERS))).toEqual([4, 3, 2, 1]);
    expect(nums(filterHistory(ALL, { ...DEFAULT_HISTORY_FILTERS, status: "cancelled" }))).toEqual([2]);
    expect(nums(filterHistory(ALL, { ...DEFAULT_HISTORY_FILTERS, from: "2026-10-01", to: "2026-10-31" }))).toEqual([4, 3, 1]);
    expect(nums(filterHistory(ALL, { ...DEFAULT_HISTORY_FILTERS, from: "2026-09-30", to: "2026-09-01" }))).toEqual([2]);
    expect(nums(filterHistory(ALL, { ...DEFAULT_HISTORY_FILTERS, query: "ne-000003" }))).toEqual([3]);
  });

  it("cuenta por estado de cierre", () => {
    expect(countByClosedStatus(ALL)).toEqual({ delivered: 1, cancelled: 1, refunded: 1, expired: 1 });
  });
});

describe("paginación", () => {
  const list = Array.from({ length: 60 }, (_, i) => i + 1);

  it("25 por página y acota la página", () => {
    expect(paginate(list, 1)).toMatchObject({ page: 1, pages: 3, from: 1, to: 25, total: 60 });
    expect(paginate(list, 3)).toMatchObject({ page: 3, from: 51, to: 60, items: list.slice(50) });
    expect(paginate(list, 99).page).toBe(3);
    expect(paginate([], 1)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, items: [] });
  });

  it("números de página con saltos", () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(5, 12)).toEqual([1, "…", 4, 5, 6, "…", 12]);
    expect(pageNumbers(1, 12)).toEqual([1, 2, "…", 12]);
  });
});

describe("historial contra Firestore", () => {
  it("inicio del día en Santiago, con horario de verano e invierno", () => {
    expect(new Date(dayStartMs("2026-01-15")).toISOString()).toBe("2026-01-15T03:00:00.000Z"); // UTC-3
    expect(new Date(dayStartMs("2026-06-15")).toISOString()).toBe("2026-06-15T04:00:00.000Z"); // UTC-4
  });

  it("rango de fechas inclusivo, [inicio de 'desde', inicio del día siguiente a 'hasta'), e invierte si vienen al revés", () => {
    const r = historyDateRange({ from: "2026-01-10", to: "2026-01-12" });
    expect(new Date(r.start!).toISOString()).toBe("2026-01-10T03:00:00.000Z");
    expect(new Date(r.end!).toISOString()).toBe("2026-01-13T03:00:00.000Z");
    expect(historyDateRange({ from: "2026-01-12", to: "2026-01-10" })).toEqual(r);
    expect(historyDateRange({ from: "", to: "" })).toEqual({ start: null, end: null });
  });

  it("búsqueda: número exacto o correo completo; el resto no se puede consultar", () => {
    expect(parseHistorySearch("  ")).toEqual({ kind: "none" });
    expect(parseHistorySearch("NE-000123")).toEqual({ kind: "number", orderNumber: "NE-000123" });
    expect(parseHistorySearch("ne-123")).toEqual({ kind: "number", orderNumber: "NE-000123" });
    expect(parseHistorySearch("1234567")).toEqual({ kind: "number", orderNumber: "NE-1234567" });
    expect(parseHistorySearch(" Ana@Example.com ")).toEqual({ kind: "email", email: "ana@example.com" });
    expect(parseHistorySearch("0")).toEqual({ kind: "unsupported" });
    expect(parseHistorySearch("Ana Pérez")).toEqual({ kind: "unsupported" });
  });

  describe("paginación por cursores", () => {
    const source = Array.from({ length: 60 }, (_, i) => o(60 - i, {}));
    function fake() {
      const calls: { after: number | null; count: number }[] = [];
      const fetch = async (after: number | null, count: number) => {
        calls.push({ after, count });
        const start = after === null ? 0 : after + 1;
        const items = source.slice(start, start + count);
        return { items, last: items.length ? start + items.length - 1 : null };
      };
      return { calls, fetch };
    }

    it("pide solo lo que falta y reutiliza las páginas ya leídas", async () => {
      const { calls, fetch } = fake();
      const page = createHistoryPager(fetch, async () => source.length);
      expect(await page(1)).toMatchObject({ page: 1, pages: 3, from: 1, to: 25, total: 60 });
      expect(nums((await page(3)).items)).toEqual(nums(source.slice(50)));
      expect(calls).toEqual([
        { after: null, count: 25 },
        { after: 24, count: 50 },
      ]);
      expect(nums((await page(2)).items)).toEqual(nums(source.slice(25, 50)));
      expect(await page(99)).toMatchObject({ page: 3, from: 51, to: 60 });
      expect(calls).toHaveLength(2);
    });

    it("dos pedidos seguidos no leen la misma página dos veces", async () => {
      const { calls, fetch } = fake();
      const page = createHistoryPager(fetch, async () => source.length);
      const [a, b] = await Promise.all([page(2), page(2)]);
      expect(a.items).toEqual(b.items);
      expect(calls).toEqual([{ after: null, count: 50 }]);
    });

    it("sin resultados y error de conteo reintentable", async () => {
      const empty = createHistoryPager(async () => ({ items: [], last: null }), async () => 0);
      expect(await empty(1)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, total: 0, items: [] });

      let fail = true;
      const flaky = createHistoryPager(fake().fetch, async () => {
        if (fail) throw new Error("red");
        return source.length;
      });
      await expect(flaky(1)).rejects.toThrow("red");
      fail = false;
      expect((await flaky(1)).total).toBe(60);
    });
  });
});
