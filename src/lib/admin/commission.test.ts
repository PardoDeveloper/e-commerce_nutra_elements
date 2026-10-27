import { describe, expect, it } from "vitest";
import { commissionToInput, lineCommission, orderCommission, parseCommissionInput } from "./commission";
import { computeMetrics, monthCommission, previousMonth } from "./metrics";
import { makeOrder } from "./testing";

// 2 unidades × $1.250 de comisión fija por unidad.
const item = { sku: "1001", name: "Producto", unitPrice: 10000, discount: null, unitFinalPrice: 10000, qty: 2, lineTotal: 20000, commissionPerUnit: 1250, commission: 2500 };

const paid = (over = {}) =>
  makeOrder({ items: [item], subtotal: 20000, shipping: 3990, total: 23990, paymentStatus: "paid", fulfillmentStatus: "preparing", stockState: "committed", paidAt: "2026-10-14T15:00:00.000Z", ...over });

describe("parseCommissionInput", () => {
  it("acepta pesos con o sin puntos y $; vacío es sin comisión", () => {
    expect(parseCommissionInput("1.500")).toBe(1500);
    expect(parseCommissionInput("$ 1.500")).toBe(1500);
    expect(parseCommissionInput("800")).toBe(800);
    expect(parseCommissionInput("0")).toBe(0);
    expect(parseCommissionInput("")).toBeNull();
  });
  it("rechaza decimales, negativos, texto y montos sobre el tope", () => {
    for (const bad of ["12,5", "-5", "abc", "100000000"]) expect(parseCommissionInput(bad)).toBeUndefined();
  });
  it("valor inicial del campo", () => {
    expect(commissionToInput(1500)).toBe("1500");
    expect(commissionToInput(null)).toBe("");
  });
});

describe("lineCommission", () => {
  it("monto fijo por unidad × cantidad, sin importar el precio o el descuento", () => {
    expect(lineCommission(3, 1500)).toBe(4500);
    expect(lineCommission(3, null)).toBe(0);
    expect(lineCommission(3, 0)).toBe(0);
    expect(orderCommission(paid())).toBe(2500);
  });
});

describe("comisiones en métricas", () => {
  it("suma al pagar y revierte en proporción al reembolso", () => {
    expect(computeMetrics([paid()], 7, "2026-10-15").commission).toBe(2500);
    const refunded = paid({
      paymentStatus: "refunded",
      refund: { amount: 11995, method: "transfer", refundedAt: "2026-10-15T12:00:00.000Z", note: "", restock: false, restocked: false, recordedBy: "a", recordedAt: "2026-10-15T12:00:00.000Z" },
    });
    expect(computeMetrics([refunded], 7, "2026-10-15").commission).toBe(1250);
  });
  it("agrupa por mes calendario", () => {
    const days = computeMetrics([paid(), paid({ orderNumber: "NE-000002", paidAt: "2026-09-30T15:00:00.000Z" })], 62, "2026-10-15").days;
    expect(monthCommission(days, "2026-10")).toBe(2500);
    expect(monthCommission(days, "2026-09")).toBe(2500);
    expect(previousMonth("2026-10")).toBe("2026-09");
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});
