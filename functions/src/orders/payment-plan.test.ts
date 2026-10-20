import { describe, expect, it } from "vitest";
import { canCancel, confirmNeedsProducts, planPaymentConfirmation, planReleaseOrder, type ConfirmInput, type ConfirmMode } from "./payment-plan.js";
import type { StockMap } from "./stock.js";
import { order, T0 } from "./testing/fixtures.js";
import type { PaymentStatus } from "./types.js";

const NOW = new Date(T0.getTime() + 5 * 60_000);

const stock = (a: number, b: number, reservedA = 0, reservedB = 0): StockMap =>
  new Map([
    ["1001", { sku: "1001", stock: a, reserved: reservedA }],
    ["1002", { sku: "1002", stock: b, reserved: reservedB }],
  ]);

function confirm(
  status: PaymentStatus,
  mode: ConfirmMode,
  extra: Partial<ConfirmInput> & { stockState?: "reserved" | "committed" | "released"; products?: StockMap } = {},
) {
  const { stockState, products, ...rest } = extra;
  const stockStateFinal = stockState ?? (status === "pending_payment" || status === "payment_review" ? "reserved" : status === "paid" ? "committed" : "released");
  return planPaymentConfirmation({
    order: order({ paymentStatus: status, stockState: stockStateFinal, review: status === "payment_review" ? { reason: "AMOUNT_MISMATCH", openedAt: T0 } : null }),
    products: products ?? stock(3, 2, 2, 1),
    now: NOW,
    actor: mode === "flow" ? "flow" : "uid-1",
    mode,
    ...rest,
  });
}

describe("planPaymentConfirmation - Flow", () => {
  it("pending_payment con reserva -> paid: confirma la venta, preparing, métricas y fechas", () => {
    const plan = confirm("pending_payment", "flow");
    expect(plan.kind).toBe("paid");
    if (plan.kind !== "paid") return;
    expect(plan.orderPatch).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "preparing", stockState: "committed", paidAt: NOW, updatedAt: NOW });
    // reserved -= qty; stock no cambia
    expect(plan.stock.changes).toEqual([
      { sku: "1001", stock: 3, reserved: 0, inStock: true },
      { sku: "1002", stock: 2, reserved: 0, inStock: true },
    ]);
    expect(plan.reReserved).toBe(false);
    expect(plan.metrics.daily).toMatchObject({ ordersCount: 1, revenue: 32762, merchandise: 28772, unitsSold: 3 });
    expect(plan.metrics.date).toBe("2026-10-20");
    const history = plan.orderPatch["statusHistory"] as { kind: string; from: string | null; to: string; by: string }[];
    expect(history.slice(-2)).toMatchObject([
      { kind: "payment", from: "pending_payment", to: "paid", by: "flow" },
      { kind: "fulfillment", from: null, to: "preparing", by: "system" },
    ]);
  });

  it("monto o moneda distintos -> payment_review y la reserva se mantiene (no toca stock ni estado de stock)", () => {
    for (const mismatch of ["AMOUNT_MISMATCH", "CURRENCY_MISMATCH"] as const) {
      const plan = confirm("pending_payment", "flow", { mismatch });
      expect(plan.kind).toBe("review");
      if (plan.kind !== "review") continue;
      expect(plan.reason).toBe(mismatch);
      expect(plan.orderPatch["paymentStatus"]).toBe("payment_review");
      expect(plan.orderPatch).not.toHaveProperty("stockState");
      expect(plan.orderPatch["review"]).toEqual({ reason: mismatch, openedAt: NOW });
    }
  });

  it("expired con stock suficiente -> paid re-reservando y vendiendo en la misma transacción", () => {
    const plan = confirm("expired", "flow", { products: stock(2, 1) });
    expect(plan.kind).toBe("paid");
    if (plan.kind !== "paid") return;
    expect(plan.reReserved).toBe(true);
    expect(plan.stock.changes).toEqual([
      { sku: "1001", stock: 0, reserved: 0, inStock: false },
      { sku: "1002", stock: 0, reserved: 0, inStock: false },
    ]);
    const history = plan.orderPatch["statusHistory"] as { kind: string; from: string | null; to: string }[];
    expect(history.some((h) => h.kind === "stock" && h.from === "released" && h.to === "committed")).toBe(true);
  });

  it("expired sin stock -> payment_review NO_STOCK_AFTER_EXPIRY sin tocar el stock", () => {
    const plan = confirm("expired", "flow", { products: stock(1, 5) });
    expect(plan).toMatchObject({ kind: "review", reason: "NO_STOCK_AFTER_EXPIRY" });
  });

  it("expired con monto distinto -> review por el monto, antes de mirar el stock", () => {
    expect(confirm("expired", "flow", { mismatch: "AMOUNT_MISMATCH" })).toMatchObject({ kind: "review", reason: "AMOUNT_MISMATCH" });
  });

  it("cancelled -> payment_review PAID_AFTER_CANCEL", () => {
    expect(confirm("cancelled", "flow")).toMatchObject({ kind: "review", reason: "PAID_AFTER_CANCEL" });
  });

  it("paid, payment_review y refunded no cambian (duplicado); refunded nunca vuelve a paid", () => {
    expect(confirm("paid", "flow")).toEqual({ kind: "noop", reason: "already_paid" });
    expect(confirm("payment_review", "flow")).toEqual({ kind: "noop", reason: "already_review" });
    expect(confirm("refunded", "flow")).toEqual({ kind: "noop", reason: "refunded" });
    // aunque el monto no coincida: no hay cambios
    expect(confirm("paid", "flow", { mismatch: "AMOUNT_MISMATCH" })).toEqual({ kind: "noop", reason: "already_paid" });
  });
});

describe("planPaymentConfirmation - transferencia", () => {
  it("pending_payment -> paid", () => {
    expect(confirm("pending_payment", "transfer").kind).toBe("paid");
  });
  it("expired con stock -> paid; sin stock -> review (el dinero ya llegó)", () => {
    expect(confirm("expired", "transfer", { products: stock(9, 9) }).kind).toBe("paid");
    expect(confirm("expired", "transfer", { products: stock(0, 9) })).toMatchObject({ kind: "review", reason: "NO_STOCK_AFTER_EXPIRY" });
  });
  it("paid -> noop (alreadyPaid)", () => {
    expect(confirm("paid", "transfer")).toEqual({ kind: "noop", reason: "already_paid" });
  });
  it.each(["cancelled", "payment_review", "refunded"] as const)("%s -> transición inválida", (status) => {
    expect(confirm(status, "transfer")).toEqual({ kind: "invalid" });
  });
});

describe("planPaymentConfirmation - aceptar una revisión", () => {
  it("payment_review con reserva -> paid y deja la resolución en review", () => {
    const plan = confirm("payment_review", "accept_review", { note: "Pago verificado" });
    expect(plan.kind).toBe("paid");
    if (plan.kind !== "paid") return;
    expect(plan.orderPatch["review"]).toMatchObject({ reason: "AMOUNT_MISMATCH", resolution: "accepted", resolvedBy: "uid-1", resolvedAt: NOW, note: "Pago verificado" });
  });
  it("payment_review liberada sin stock -> out_of_stock con el SKU y lo disponible", () => {
    const plan = confirm("payment_review", "accept_review", { stockState: "released", products: stock(2, 0) });
    expect(plan).toEqual({ kind: "out_of_stock", sku: "1002", available: 0 });
  });
  it("payment_review liberada con stock -> paid re-reservando", () => {
    const plan = confirm("payment_review", "accept_review", { stockState: "released", products: stock(5, 5) });
    expect(plan.kind).toBe("paid");
    if (plan.kind === "paid") expect(plan.reReserved).toBe(true);
  });
  it.each(["pending_payment", "paid", "expired", "cancelled", "refunded"] as const)("desde %s es inválida", (status) => {
    expect(confirm(status, "accept_review")).toEqual({ kind: "invalid" });
  });
});

describe("matriz completa de transiciones de pago (data-model.md 6.1)", () => {
  // Para cada estado de partida: ¿a qué estado llegan las acciones del sistema/admin?
  const outcomes = (status: PaymentStatus): string[] => {
    const results: string[] = [];
    const add = (label: string, plan: ReturnType<typeof confirm>) => {
      const to = plan.kind === "paid" ? "paid" : plan.kind === "review" ? "payment_review" : plan.kind;
      results.push(`${label}:${to}`);
    };
    add("flow", confirm(status, "flow"));
    add("transfer", confirm(status, "transfer"));
    add("accept", confirm(status, "accept_review"));
    return results;
  };

  it("sí/no por estado de partida", () => {
    expect(outcomes("pending_payment")).toEqual(["flow:paid", "transfer:paid", "accept:invalid"]);
    expect(outcomes("expired")).toEqual(["flow:paid", "transfer:paid", "accept:invalid"]);
    expect(outcomes("cancelled")).toEqual(["flow:payment_review", "transfer:invalid", "accept:invalid"]);
    expect(outcomes("payment_review")).toEqual(["flow:noop", "transfer:invalid", "accept:paid"]);
    expect(outcomes("paid")).toEqual(["flow:noop", "transfer:noop", "accept:invalid"]);
    expect(outcomes("refunded")).toEqual(["flow:noop", "transfer:invalid", "accept:invalid"]);
  });

  it("canCancel solo permite pending_payment (cancelled es idempotente)", () => {
    const statuses: PaymentStatus[] = ["pending_payment", "paid", "payment_review", "expired", "cancelled", "refunded"];
    expect(statuses.map(canCancel)).toEqual(["yes", "no", "no", "no", "already", "no"]);
  });
});

describe("confirmNeedsProducts", () => {
  const o = order();
  it("no lee productos si hay discrepancia de monto en Flow ni en estados finales", () => {
    expect(confirmNeedsProducts(o, "flow", "AMOUNT_MISMATCH")).toBe(false);
    expect(confirmNeedsProducts(order({ paymentStatus: "paid" }), "flow", undefined)).toBe(false);
    expect(confirmNeedsProducts(order({ paymentStatus: "cancelled" }), "flow", undefined)).toBe(false);
  });
  it("lee productos cuando puede haber venta", () => {
    expect(confirmNeedsProducts(o, "flow", undefined)).toBe(true);
    expect(confirmNeedsProducts(order({ paymentStatus: "expired" }), "transfer", undefined)).toBe(true);
    expect(confirmNeedsProducts(order({ paymentStatus: "payment_review" }), "accept_review", undefined)).toBe(true);
  });
});

describe("planReleaseOrder", () => {
  it("expira devolviendo la reserva y marcando released", () => {
    const plan = planReleaseOrder({ order: order(), products: stock(1, 0, 2, 1), now: NOW, actor: "system", to: "expired" });
    expect(plan.stockReleased).toBe(true);
    expect(plan.orderPatch).toMatchObject({ paymentStatus: "expired", stockState: "released" });
    expect(plan.stock.changes).toEqual([
      { sku: "1001", stock: 3, reserved: 0, inStock: true },
      { sku: "1002", stock: 1, reserved: 0, inStock: true },
    ]);
  });
  it("si el stock ya no estaba reservado no repone nada (nunca dos veces)", () => {
    const plan = planReleaseOrder({ order: order({ stockState: "released" }), products: stock(1, 0), now: NOW, actor: "system", to: "expired" });
    expect(plan.stockReleased).toBe(false);
    expect(plan.stock.changes).toEqual([]);
    expect(plan.orderPatch).not.toHaveProperty("stockState");
  });
  it("cancelar registra el motivo en el historial", () => {
    const plan = planReleaseOrder({ order: order(), products: stock(1, 0, 2, 1), now: NOW, actor: "uid-1", to: "cancelled", note: "Cliente pidió cancelar" });
    const history = plan.orderPatch["statusHistory"] as { to: string; note?: string; by: string }[];
    expect(history[1]).toMatchObject({ to: "cancelled", note: "Cliente pidió cancelar", by: "uid-1" });
  });
});
