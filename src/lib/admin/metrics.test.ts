import { describe, expect, it } from "vitest";
import { addDays, computeMetrics, dayKey, lastDays } from "./metrics";
import { defaultSettings, generateOrders, toAdminProduct } from "./seed";
import { makeOrder, makeProduct } from "./testing";
import type { Product } from "@/lib/data/types";

const TODAY = "2026-10-15";

const paidOrder = (over = {}) =>
  makeOrder({
    paymentStatus: "paid",
    fulfillmentStatus: "preparing",
    stockState: "committed",
    paidAt: "2026-10-14T15:00:00.000Z",
    ...over,
  });

describe("fechas", () => {
  it("usa el día de America/Santiago", () => {
    // 02:00 UTC del 15 sigue siendo 14 en Chile (UTC-3 o UTC-4).
    expect(dayKey("2026-10-15T02:00:00.000Z")).toBe("2026-10-14");
    expect(dayKey("2026-10-15T15:00:00.000Z")).toBe("2026-10-15");
  });
  it("suma días y arma rangos", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(lastDays(TODAY, 3)).toEqual(["2026-10-13", "2026-10-14", "2026-10-15"]);
  });
});

describe("computeMetrics (D-025)", () => {
  it("suma ventas, pedidos y ticket promedio", () => {
    const m = computeMetrics([paidOrder(), paidOrder({ orderNumber: "NE-000002", total: 10000, subtotal: 10000 })], 7, TODAY);
    expect(m.orders).toBe(2);
    expect(m.sales).toBe(23990 + 10000);
    expect(m.averageTicket).toBe(Math.round(33990 / 2));
    expect(m.days).toHaveLength(7);
    expect(m.top[0]).toMatchObject({ sku: "1001", unitsSold: 4 });
  });
  it("un reembolso baja los ingresos pero no los pedidos; las unidades solo si se repuso", () => {
    const refund = (restocked: boolean) =>
      paidOrder({
        paymentStatus: "refunded",
        refund: { amount: 3990, method: "flow", refundedAt: NOW_ISO, note: "x", restock: restocked, restocked, recordedBy: "a", recordedAt: NOW_ISO },
      });
    const sinReponer = computeMetrics([refund(false)], 7, TODAY);
    expect(sinReponer.orders).toBe(1);
    expect(sinReponer.sales).toBe(23990 - 3990);
    expect(sinReponer.refundsCount).toBe(1);
    expect(sinReponer.refundedAmount).toBe(3990);
    expect(sinReponer.top[0]?.unitsSold).toBe(2);
    const repuesto = computeMetrics([refund(true)], 7, TODAY);
    expect(repuesto.top).toHaveLength(0);
    expect(repuesto.days.reduce((s, d) => s + d.unitsSold, 0)).toBe(0);
  });
  it("sin pedidos no divide por cero", () => {
    expect(computeMetrics([], 7, TODAY)).toMatchObject({ orders: 0, sales: 0, averageTicket: 0 });
  });
  it("ignora pedidos no pagados y fuera de rango", () => {
    const m = computeMetrics([makeOrder(), paidOrder({ paidAt: "2026-08-01T12:00:00.000Z" })], 7, TODAY);
    expect(m.orders).toBe(0);
  });
});

const NOW_ISO = "2026-10-15T15:00:00.000Z";

function catalog(): Product[] {
  return Array.from({ length: 12 }, (_, i) => ({
    sku: `P${i}`,
    name: `Producto ${i}`,
    slug: `producto-${i}`,
    description: null,
    shortDescription: null,
    categoryId: "vitaminas" as const,
    images: [],
    price: 5000 + i * 100,
    discount: null,
    finalPrice: 5000 + i * 100,
    inStock: i !== 3,
    format: null,
    unitsPerPack: null,
    seo: null,
  }));
}

describe("datos de demostración", () => {
  const products = catalog().map(toAdminProduct);
  const settings = defaultSettings({
    shippingFee: 3990,
    freeShippingThreshold: null,
    pickup: { enabled: true, address: "Calle 1", hours: "9 a 20" },
    maxQtyPerItem: 10,
  });
  const ctx = { products, communes: [{ code: "puente-alto", name: "Puente Alto" }], settings, now: new Date(NOW_ISO) };

  it("el stock es estable y los productos agotados quedan en 0", () => {
    expect(products[3]?.stock).toBe(0);
    expect(products[0]?.stock).toBeGreaterThan(0);
    expect(catalog().map(toAdminProduct)[0]?.stock).toBe(products[0]?.stock);
  });
  it("genera exactamente los mismos pedidos cada vez (determinista)", () => {
    expect(generateOrders(ctx)).toEqual(generateOrders(ctx));
  });
  it("cubre estados variados y números consecutivos", () => {
    const orders = generateOrders(ctx);
    expect(orders.length).toBeGreaterThan(150);
    expect(orders[0]?.orderNumber).toBe("NE-000001");
    expect(new Set(orders.map((o) => o.paymentStatus)).size).toBeGreaterThanOrEqual(3);
    for (const o of orders) {
      expect(o.total).toBe(o.subtotal + o.shipping);
      expect(Date.parse(o.createdAt)).toBeLessThanOrEqual(Date.parse(NOW_ISO));
      if (o.paidAt) expect(Date.parse(o.paidAt)).toBeLessThanOrEqual(Date.parse(NOW_ISO));
      if (o.paymentStatus === "paid") expect(o.fulfillmentStatus).not.toBeNull();
    }
  });
  it("las métricas del rango de 90 días salen con datos", () => {
    const m = computeMetrics(generateOrders(ctx), 90, "2026-10-15");
    expect(m.orders).toBeGreaterThan(100);
    expect(m.top).toHaveLength(10);
    expect(m.sales).toBeGreaterThan(0);
  });
  it("makeProduct se usa como base de pruebas", () => {
    expect(makeProduct().sku).toBe("1001");
  });
});
