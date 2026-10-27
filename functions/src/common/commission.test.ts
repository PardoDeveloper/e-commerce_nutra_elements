import { describe, expect, it } from "vitest";
import { lineCommission, readCommissionPerUnit, refundedCommission } from "./commission.js";
import { paymentIncrements, refundIncrements } from "./metrics.js";

describe("lineCommission", () => {
  it("es un monto fijo en CLP por unidad × cantidad", () => {
    expect(lineCommission(2, 1500)).toBe(3000);
    expect(lineCommission(1, 990)).toBe(990);
  });

  it("sin monto o con monto 0 no hay comisión", () => {
    expect(lineCommission(2, null)).toBe(0);
    expect(lineCommission(2, undefined)).toBe(0);
    expect(lineCommission(2, 0)).toBe(0);
  });
});

describe("readCommissionPerUnit", () => {
  it("acepta enteros 0..10.000.000; lo demás es null", () => {
    expect(readCommissionPerUnit(1500)).toBe(1500);
    expect(readCommissionPerUnit(0)).toBe(0);
    expect(readCommissionPerUnit(10_000_001)).toBeNull();
    expect(readCommissionPerUnit(12.5)).toBeNull();
    expect(readCommissionPerUnit("1500")).toBeNull();
    expect(readCommissionPerUnit(undefined)).toBeNull();
  });
});

describe("refundedCommission", () => {
  it("total revierte todo; parcial en proporción al monto", () => {
    expect(refundedCommission(3000, 23772, 23772)).toBe(3000);
    expect(refundedCommission(2000, 5000, 20000)).toBe(500);
    expect(refundedCommission(0, 5000, 20000)).toBe(0);
  });
});

describe("métricas con comisión", () => {
  const order = {
    paidAt: new Date("2026-10-20T15:00:00Z"),
    total: 23772,
    subtotal: 19782,
    items: [
      { sku: "1", name: "A", qty: 2, lineTotal: 9891, commission: 2000 },
      { sku: "2", name: "B", qty: 1, lineTotal: 9891, commission: 500 },
    ],
  };

  it("al pagar suma la comisión del pedido", () => {
    expect(paymentIncrements(order).daily.commission).toBe(2500);
  });

  it("al reembolsar la revierte (total y parcial)", () => {
    expect(refundIncrements({ ...order, refund: { amount: 23772, restocked: false } }).daily.commission).toBe(-2500);
    expect(refundIncrements({ ...order, refund: { amount: 11886, restocked: false } }).daily.commission).toBe(-1250);
  });
});
