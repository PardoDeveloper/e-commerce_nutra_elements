import { describe, expect, it } from "vitest";
import { getAppErrorCode } from "./errors.js";
import {
  averageTicket,
  businessDate,
  dailyMetricsPath,
  paymentIncrements,
  productMetricsPath,
  refundIncrements,
  type MetricsItem,
} from "./metrics.js";

// Pedido del ejemplo del modelo de datos: 2 x 9.891 + 1 x 8.990 = 28.772; envío 3.990; total 32.762.
const items: MetricsItem[] = [
  { sku: "2427831", name: "Citrato de Magnesio x 120 cápsulas", qty: 2, lineTotal: 19782 },
  { sku: "2427851", name: "Vitamina C x 60 cápsulas", qty: 1, lineTotal: 8990 },
];
const order = { paidAt: new Date("2026-10-20T15:00:00Z"), total: 32762, subtotal: 28772, items };

describe("businessDate (America/Santiago)", () => {
  it("verano (UTC-3): 02:59:59Z sigue en el día anterior y 03:00:00Z ya es el siguiente", () => {
    expect(businessDate(new Date("2026-01-15T02:59:59Z"))).toBe("2026-01-14");
    expect(businessDate(new Date("2026-01-15T03:00:00Z"))).toBe("2026-01-15");
  });

  it("invierno (UTC-4): 03:59:59Z sigue en el día anterior y 04:00:00Z ya es el siguiente", () => {
    expect(businessDate(new Date("2026-07-15T03:59:59Z"))).toBe("2026-07-14");
    expect(businessDate(new Date("2026-07-15T04:00:00Z"))).toBe("2026-07-15");
  });

  it("medianoche de negocio vs medianoche UTC: 23:30 en Chile ya es otro día en UTC", () => {
    // 2026-10-20 23:30 en Chile (UTC-3 en octubre) = 2026-10-21 02:30Z.
    expect(businessDate(new Date("2026-10-21T02:30:00Z"))).toBe("2026-10-20");
    // 00:30 del 21 en Chile = 03:30Z.
    expect(businessDate(new Date("2026-10-21T03:30:00Z"))).toBe("2026-10-21");
  });

  it("fin del horario de verano (4 de abril de 2026 a las 24:00): la hora repetida sigue siendo el 4", () => {
    // El reloj pasa de UTC-3 a UTC-4 el 5 de abril a las 03:00Z (sábado 24:00 local).
    expect(businessDate(new Date("2026-04-05T02:59:59Z"))).toBe("2026-04-04");
    expect(businessDate(new Date("2026-04-05T03:00:00Z"))).toBe("2026-04-04"); // 23:00 local, repetida
    expect(businessDate(new Date("2026-04-05T03:59:59Z"))).toBe("2026-04-04");
    expect(businessDate(new Date("2026-04-05T04:00:00Z"))).toBe("2026-04-05");
  });

  it("inicio del horario de verano (5 de septiembre de 2026 a las 24:00): se salta de 24:00 a 01:00", () => {
    // El reloj pasa de UTC-4 a UTC-3 el 6 de septiembre a las 04:00Z.
    expect(businessDate(new Date("2026-09-06T03:59:59Z"))).toBe("2026-09-05");
    expect(businessDate(new Date("2026-09-06T04:00:00Z"))).toBe("2026-09-06");
  });

  it("fin de año y bisiesto", () => {
    expect(businessDate(new Date("2026-01-01T02:59:59Z"))).toBe("2025-12-31");
    expect(businessDate(new Date("2028-03-01T02:59:59Z"))).toBe("2028-02-29");
  });

  it("rechaza fechas inválidas", () => {
    expect(() => businessDate(new Date("no es fecha"))).toThrow(RangeError);
  });

  it("el formato siempre es YYYY-MM-DD con ceros", () => {
    expect(businessDate(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-05");
  });
});

describe("rutas", () => {
  it("armadas según el modelo de datos", () => {
    expect(dailyMetricsPath("2026-10-20")).toBe("metrics/daily/days/2026-10-20");
    expect(productMetricsPath("2427831")).toBe("metrics/products/items/2427831");
  });
});

describe("paymentIncrements (pasar a paid)", () => {
  it("suma el pedido completo en el día de paidAt", () => {
    expect(paymentIncrements(order)).toEqual({
      date: "2026-10-20",
      daily: { ordersCount: 1, revenue: 32762, merchandise: 28772, unitsSold: 3, refundsCount: 0, refundedAmount: 0, commission: 0 },
      products: [
        { sku: "2427831", name: "Citrato de Magnesio x 120 cápsulas", unitsSold: 2, revenue: 19782 },
        { sku: "2427851", name: "Vitamina C x 60 cápsulas", unitsSold: 1, revenue: 8990 },
      ],
    });
  });

  it("el día es el de negocio, no el UTC", () => {
    const r = paymentIncrements({ ...order, paidAt: new Date("2026-10-21T02:30:00Z") });
    expect(r.date).toBe("2026-10-20");
  });
});

describe("refundIncrements (D-025, casos 9b del contrato)", () => {
  const base = { paidAt: order.paidAt, total: order.total, items };

  it("(a) restock true y reembolso total: ingresos, reembolso y unidades (diarias y por SKU)", () => {
    const r = refundIncrements({ ...base, refund: { amount: 32762, restocked: true } });
    expect(r.date).toBe("2026-10-20");
    expect(r.daily).toEqual({
      ordersCount: 0,
      revenue: -32762,
      merchandise: 0,
      unitsSold: -3,
      refundsCount: 1,
      refundedAmount: 32762,
      commission: 0,
    });
    expect(r.products).toEqual([
      { sku: "2427831", name: "Citrato de Magnesio x 120 cápsulas", unitsSold: -2, revenue: -19782 },
      { sku: "2427851", name: "Vitamina C x 60 cápsulas", unitsSold: -1, revenue: -8990 },
    ]);
  });

  it("(a2) restock true y reembolso parcial: revenue baja solo amount, unidades sí se restan", () => {
    const r = refundIncrements({ ...base, refund: { amount: 10000, restocked: true } });
    expect(r.daily).toEqual({
      ordersCount: 0,
      revenue: -10000,
      merchandise: 0,
      unitsSold: -3,
      refundsCount: 1,
      refundedAmount: 10000,
      commission: 0,
    });
    expect(r.products.map((p) => [p.sku, p.unitsSold, p.revenue])).toEqual([
      ["2427831", -2, -19782],
      ["2427851", -1, -8990],
    ]);
  });

  it("(b) restock false y reembolso total: solo ingresos y reembolso; unidades y SKU intactos", () => {
    const r = refundIncrements({ ...base, refund: { amount: 32762, restocked: false } });
    expect(r.daily).toEqual({
      ordersCount: 0,
      revenue: -32762,
      merchandise: 0,
      unitsSold: 0,
      refundsCount: 1,
      refundedAmount: 32762,
      commission: 0,
    });
    expect(r.products).toEqual([]);
  });

  it("(b2) restock false y reembolso parcial: revenue baja solo amount; ordersCount, merchandise y unidades intactos", () => {
    const r = refundIncrements({ ...base, refund: { amount: 5000, restocked: false } });
    expect(r.daily).toEqual({
      ordersCount: 0,
      revenue: -5000,
      merchandise: 0,
      unitsSold: 0,
      refundsCount: 1,
      refundedAmount: 5000,
      commission: 0,
    });
    expect(r.products).toEqual([]);
  });

  it("(b2) el ticket promedio resultante es revenue neto / ordersCount", () => {
    // Un solo pedido de 32.762 pagado ese día, con reembolso parcial de 5.000.
    const paid = paymentIncrements(order).daily;
    const refund = refundIncrements({ ...base, refund: { amount: 5000, restocked: false } }).daily;
    const revenue = paid.revenue + refund.revenue;
    const ordersCount = paid.ordersCount + refund.ordersCount;
    expect(revenue).toBe(27762);
    expect(ordersCount).toBe(1);
    expect(averageTicket(revenue, ordersCount)).toBe(27762);
  });

  it("(b3) el reembolso se asienta en el día de paidAt aunque refundedAt caiga otro día", () => {
    const paidAt = new Date("2026-10-20T15:00:00Z"); // 20 de octubre en Chile
    const refundedAt = new Date("2026-11-03T15:00:00Z"); // otro día y otro mes
    expect(businessDate(refundedAt)).not.toBe("2026-10-20");
    const r = refundIncrements({ ...base, paidAt, refund: { amount: 1000, restocked: true } });
    expect(r.date).toBe("2026-10-20");
    // El resultado no depende de refundedAt: ni siquiera es parte de la entrada.
  });

  it("(b3) paidAt cerca de la medianoche chilena usa el día de negocio", () => {
    const r = refundIncrements({ ...base, paidAt: new Date("2026-10-21T02:59:59Z"), refund: { amount: 1000, restocked: false } });
    expect(r.date).toBe("2026-10-20");
  });

  it("monto = 1 (mínimo) y = total (máximo) son válidos", () => {
    expect(refundIncrements({ ...base, refund: { amount: 1, restocked: false } }).daily.revenue).toBe(-1);
    expect(refundIncrements({ ...base, refund: { amount: 32762, restocked: false } }).daily.refundedAmount).toBe(32762);
  });

  it.each([0, -5, 1.5, 32763, Number.NaN])("monto %s -> INVALID_REFUND_AMOUNT", (amount) => {
    try {
      refundIncrements({ ...base, refund: { amount, restocked: true } });
      expect.unreachable();
    } catch (e) {
      expect(getAppErrorCode(e)).toBe("INVALID_REFUND_AMOUNT");
    }
  });

  it("no produce -0 en los campos sin cambio", () => {
    const r = refundIncrements({ ...base, refund: { amount: 100, restocked: false } });
    expect(Object.is(r.daily.unitsSold, 0)).toBe(true);
    expect(Object.is(r.daily.merchandise, 0)).toBe(true);
  });

  it("pago + reembolso total con reposición deja unidades y SKU en cero, y ordersCount en 1", () => {
    const paid = paymentIncrements(order);
    const refunded = refundIncrements({ ...base, refund: { amount: 32762, restocked: true } });
    expect(paid.daily.unitsSold + refunded.daily.unitsSold).toBe(0);
    expect(paid.daily.revenue + refunded.daily.revenue).toBe(0);
    expect(paid.daily.ordersCount + refunded.daily.ordersCount).toBe(1);
    expect(paid.daily.merchandise + refunded.daily.merchandise).toBe(28772);
    paid.products.forEach((p, i) => {
      expect(p.unitsSold + (refunded.products[i]?.unitsSold ?? NaN)).toBe(0);
      expect(p.revenue + (refunded.products[i]?.revenue ?? NaN)).toBe(0);
    });
  });
});

describe("averageTicket", () => {
  it("promedia y redondea", () => {
    expect(averageTicket(100000, 4)).toBe(25000);
    expect(averageTicket(10000, 3)).toBe(3333);
    expect(averageTicket(20000, 3)).toBe(6667);
  });
  it("sin pedidos devuelve null (no divide por cero)", () => {
    expect(averageTicket(0, 0)).toBeNull();
    expect(averageTicket(500, 0)).toBeNull();
    expect(averageTicket(500, -1)).toBeNull();
    expect(averageTicket(Number.NaN, 2)).toBeNull();
  });
});
