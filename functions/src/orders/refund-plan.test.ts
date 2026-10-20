import { describe, expect, it } from "vitest";
import { getAppErrorCode } from "../common/errors.js";
import { planRefund, REFUND_FUTURE_TOLERANCE_MS, validateRefund, type RefundInput } from "./refund-plan.js";
import type { StockMap } from "./stock.js";
import { order, T0 } from "./testing/fixtures.js";

const PAID_AT = T0;
const NOW = new Date(T0.getTime() + 2 * 24 * 3600_000); // 2 días después, mismo mes
const paid = (overrides: Record<string, unknown> = {}) => order({ paymentStatus: "paid", fulfillmentStatus: "preparing", stockState: "committed", paidAt: PAID_AT, ...overrides });
const products: StockMap = new Map([
  ["1001", { sku: "1001", stock: 0, reserved: 4 }],
  ["1002", { sku: "1002", stock: 7, reserved: 0 }],
]);
const base: RefundInput = { amount: 32762, method: "flow", refundedAt: new Date(NOW.getTime() - 3600_000), note: "Devuelto desde el panel de Flow", restock: true };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return getAppErrorCode(err);
  }
  return undefined;
}

describe("planRefund - reposición y métricas (D-025)", () => {
  it("(a) total con restock: repone stock, released, restocked true y métricas completas", () => {
    const plan = planRefund({ order: paid(), products, now: NOW, uid: "uid-1", refund: base });
    expect(plan.restocked).toBe(true);
    expect(plan.stock.changes).toEqual([
      { sku: "1001", stock: 2, reserved: 4, inStock: true },
      { sku: "1002", stock: 8, reserved: 0, inStock: true },
    ]);
    expect(plan.orderPatch).toMatchObject({ paymentStatus: "refunded", stockState: "released" });
    expect(plan.orderPatch["refund"]).toEqual({
      amount: 32762,
      method: "flow",
      refundedAt: base.refundedAt,
      note: base.note,
      restock: true,
      restocked: true,
      recordedBy: "uid-1",
      recordedAt: NOW,
    });
    expect(plan.metrics.date).toBe("2026-10-20"); // día de paidAt, no del reembolso
    expect(plan.metrics.daily).toEqual({ ordersCount: 0, revenue: -32762, merchandise: 0, unitsSold: -3, refundsCount: 1, refundedAmount: 32762 });
    expect(plan.metrics.products).toEqual([
      { sku: "1001", name: "Citrato de Magnesio x 120", unitsSold: -2, revenue: -19782 },
      { sku: "1002", name: "Vitamina C x 60", unitsSold: -1, revenue: -8990 },
    ]);
    const history = plan.orderPatch["statusHistory"] as Record<string, unknown>[];
    expect(history.at(-2)).toMatchObject({ kind: "payment", from: "paid", to: "refunded", by: "uid-1", note: base.note, refund: { amount: 32762, method: "flow", restock: true } });
    expect(history.at(-1)).toMatchObject({ kind: "stock", from: "committed", to: "released" });
  });

  it("(a2) parcial con restock: revenue baja solo amount; unidades sí (restocked)", () => {
    const plan = planRefund({ order: paid(), products, now: NOW, uid: "u", refund: { ...base, amount: 10000 } });
    expect(plan.metrics.daily).toMatchObject({ revenue: -10000, refundedAmount: 10000, refundsCount: 1, unitsSold: -3, ordersCount: 0, merchandise: 0 });
    expect(plan.metrics.products).toHaveLength(2);
  });

  it("(b) total sin restock: stock y stockState intactos, unidades y métricas por SKU intactas", () => {
    const plan = planRefund({ order: paid(), products, now: NOW, uid: "u", refund: { ...base, restock: false } });
    expect(plan.restocked).toBe(false);
    expect(plan.stock.changes).toEqual([]);
    expect(plan.orderPatch).not.toHaveProperty("stockState");
    expect((plan.orderPatch["refund"] as { restocked: boolean }).restocked).toBe(false);
    expect(plan.metrics.daily).toEqual({ ordersCount: 0, revenue: -32762, merchandise: 0, unitsSold: 0, refundsCount: 1, refundedAmount: 32762 });
    expect(plan.metrics.products).toEqual([]);
    const history = plan.orderPatch["statusHistory"] as { kind: string }[];
    expect(history.some((h) => h.kind === "stock")).toBe(false);
  });

  it("(b2) parcial sin restock: solo revenue y refundedAmount cambian", () => {
    const plan = planRefund({ order: paid(), products, now: NOW, uid: "u", refund: { ...base, amount: 5000, restock: false } });
    expect(plan.metrics.daily).toEqual({ ordersCount: 0, revenue: -5000, merchandise: 0, unitsSold: 0, refundsCount: 1, refundedAmount: 5000 });
    expect(plan.metrics.products).toEqual([]);
  });

  it("(b3) el reembolso se asienta en el día de paidAt aunque refundedAt caiga en otro día", () => {
    const plan = planRefund({ order: paid({ paidAt: new Date("2026-10-20T15:00:00Z") }), products, now: new Date("2026-11-30T12:00:00Z"), uid: "u", refund: { ...base, refundedAt: new Date("2026-11-29T12:00:00Z") } });
    expect(plan.metrics.date).toBe("2026-10-20");
  });

  it("(b4) restock pedido pero stockState != committed: restocked false y unidades intactas", () => {
    const plan = planRefund({ order: paid({ stockState: "released" }), products, now: NOW, uid: "u", refund: base });
    expect(plan.restocked).toBe(false);
    expect(plan.stock.changes).toEqual([]);
    expect(plan.metrics.daily.unitsSold).toBe(0);
    expect((plan.orderPatch["refund"] as { restock: boolean; restocked: boolean })).toMatchObject({ restock: true, restocked: false });
  });

  it("repone aunque un producto ya no exista: lo informa como faltante y repone el resto", () => {
    const plan = planRefund({ order: paid(), products: new Map([["1002", { sku: "1002", stock: 1, reserved: 0 }]]), now: NOW, uid: "u", refund: base });
    expect(plan.stock.missing).toEqual(["1001"]);
    expect(plan.stock.changes.map((c) => c.sku)).toEqual(["1002"]);
  });
});

describe("validateRefund", () => {
  const o = paid();
  it("(e) monto 0, negativo, decimal, NaN o mayor que el total -> INVALID_REFUND_AMOUNT", () => {
    for (const amount of [0, -1, 10.5, Number.NaN, 32763, Number.MAX_SAFE_INTEGER + 2]) {
      expect(codeOf(() => validateRefund(o, { ...base, amount }, NOW))).toBe("INVALID_REFUND_AMOUNT");
    }
  });
  it("monto 1 y monto igual al total son válidos", () => {
    expect(codeOf(() => validateRefund(o, { ...base, amount: 1 }, NOW))).toBeUndefined();
    expect(codeOf(() => validateRefund(o, { ...base, amount: 32762 }, NOW))).toBeUndefined();
  });
  it("(f) fecha futura (pasada la tolerancia) o anterior a paidAt -> INVALID_REFUND_DATE", () => {
    expect(codeOf(() => validateRefund(o, { ...base, refundedAt: new Date(NOW.getTime() + REFUND_FUTURE_TOLERANCE_MS + 1) }, NOW))).toBe("INVALID_REFUND_DATE");
    expect(codeOf(() => validateRefund(o, { ...base, refundedAt: new Date(PAID_AT.getTime() - 1) }, NOW))).toBe("INVALID_REFUND_DATE");
    expect(codeOf(() => validateRefund(o, { ...base, refundedAt: new Date("no-es-fecha") }, NOW))).toBe("INVALID_REFUND_DATE");
  });
  it("dentro de la tolerancia de 5 minutos y justo en paidAt es válido", () => {
    expect(codeOf(() => validateRefund(o, { ...base, refundedAt: new Date(NOW.getTime() + REFUND_FUTURE_TOLERANCE_MS) }, NOW))).toBeUndefined();
    expect(codeOf(() => validateRefund(o, { ...base, refundedAt: PAID_AT }, NOW))).toBeUndefined();
  });
});
