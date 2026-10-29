import { describe, expect, it } from "vitest";
import { DEFAULT_SALE_FILTERS, filterSales, netCommission, netTotal, periodRange, salesTotals } from "./sales";
import { makeOrder } from "./testing";
import type { AdminOrder } from "./types";

const TODAY = "2026-10-27";
const item = { sku: "1001", name: "Citrato de Magnesio", unitPrice: 10000, discount: null, unitFinalPrice: 10000, qty: 2, lineTotal: 20000, commissionPerUnit: 1000, commission: 2000 };

const sale = (over: Partial<AdminOrder> = {}): AdminOrder =>
  makeOrder({ paymentMethod: "flow", items: [item], subtotal: 20000, shipping: 0, total: 20000, paymentStatus: "paid", fulfillmentStatus: "preparing", stockState: "committed", paidAt: "2026-10-20T15:00:00.000Z", ...over });

const refund = { amount: 5000, method: "transfer" as const, refundedAt: "2026-10-21T12:00:00.000Z", note: "", restock: false, restocked: false, recordedBy: "a", recordedAt: "2026-10-21T12:00:00.000Z" };

const ALL = [
  sale({ orderNumber: "NE-000001", paidAt: "2026-09-15T15:00:00.000Z" }),
  sale({ orderNumber: "NE-000002", paidAt: "2026-10-05T15:00:00.000Z" }),
  sale({ orderNumber: "NE-000003", paymentStatus: "refunded", refund }),
  sale({ orderNumber: "NE-000004", paymentStatus: "pending_payment", paidAt: null }),
];

const nums = (list: AdminOrder[]) => list.map((o) => o.orderNumber);

describe("filterSales", () => {
  it("solo pedidos pagados o reembolsados del mes, del más reciente al más antiguo", () => {
    expect(nums(filterSales(ALL, DEFAULT_SALE_FILTERS, TODAY))).toEqual(["NE-000003", "NE-000002"]);
  });
  it("mes anterior, todo y rango propio", () => {
    expect(nums(filterSales(ALL, { ...DEFAULT_SALE_FILTERS, period: "lastMonth" }, TODAY))).toEqual(["NE-000001"]);
    expect(nums(filterSales(ALL, { ...DEFAULT_SALE_FILTERS, period: "all" }, TODAY))).toHaveLength(3);
    expect(nums(filterSales(ALL, { ...DEFAULT_SALE_FILTERS, period: "custom", from: "2026-10-10", to: "2026-10-01" }, TODAY))).toEqual(["NE-000002"]);
  });
  it("por estado, medio de pago y texto (producto sin tildes)", () => {
    expect(nums(filterSales(ALL, { ...DEFAULT_SALE_FILTERS, status: "refunded" }, TODAY))).toEqual(["NE-000003"]);
    expect(nums(filterSales(ALL, { ...DEFAULT_SALE_FILTERS, method: "flow" }, TODAY))).toEqual(["NE-000003", "NE-000002"]);
    expect(nums(filterSales(ALL, { ...DEFAULT_SALE_FILTERS, period: "all", query: "CITRATO" }, TODAY))).toHaveLength(3);
  });
});

describe("totales y montos netos", () => {
  it("descuenta el reembolso del total y la comisión en proporción", () => {
    const r = sale({ paymentStatus: "refunded", refund });
    expect(netTotal(r)).toBe(15000);
    expect(netCommission(r)).toBe(1500);
    expect(salesTotals([sale(), r])).toEqual({ count: 2, units: 4, revenue: 35000, commission: 3500 });
  });
  it("períodos", () => {
    expect(periodRange({ period: "month", from: "", to: "" }, TODAY)).toEqual({ from: "2026-10-01", to: TODAY });
    expect(periodRange({ period: "lastMonth", from: "", to: "" }, "2026-03-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange({ period: "all", from: "", to: "" }, TODAY)).toEqual({ from: null, to: null });
  });
});
