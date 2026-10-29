import { describe, expect, it } from "vitest";
import type { DocData } from "../common/db.js";
import { getAppErrorCode } from "../common/errors.js";
import { assertAdmin } from "../common/auth.js";
import {
  handleCancelOrder,
  handleRecordManualRefund,
  handleResolvePaymentReview,
  handleUpdateFulfillment,
} from "./admin-orders.js";
import { ADMIN_UID, flowState, makeEnv, orderDoc, paidOrderDoc, productDoc, productStock, T0, type TestEnv } from "./testing/fixtures.js";

// Handlers de administración sobre el DOBLE en memoria de Firestore. La autorización
// (assertAdmin) se aplica en el callable; aquí se prueba por separado con el mismo helper.

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (err) {
    return getAppErrorCode(err) ?? `otro:${String(err)}`;
  }
  return undefined;
}

/** Pedido y productos con la reserva ya descontada (stock 3/2 y reserved 2/1). */
function setup(orderOverrides: DocData = {}, stock?: { s1001: number; r1001: number; s1002: number; r1002: number }): TestEnv {
  const s = stock ?? { s1001: 3, r1001: 2, s1002: 2, r1002: 1 };
  return makeEnv({
    "orders/NE-000001": orderDoc(orderOverrides),
    "products/1001": productDoc("1001", { name: "Citrato de Magnesio x 120", stock: s.s1001, reserved: s.r1001 }),
    "products/1002": productDoc("1002", { name: "Vitamina C x 60", stock: s.s1002, reserved: s.r1002 }),
  });
}
const o = (env: TestEnv) => env.db.peek("orders/NE-000001") as DocData;
const day = (env: TestEnv) => env.db.peek("metrics/daily/days/2026-10-20");
const NUM = { orderNumber: "NE-000001" };

describe("autorización (test 13)", () => {
  const withAdmin = (admin: unknown) => ({ auth: { uid: "u1", token: { admin } } });
  it("sin sesión -> UNAUTHENTICATED; sin claim -> NOT_ADMIN; admin -> uid", () => {
    expect(() => assertAdmin({})).toThrowError(expect.objectContaining({ code: "unauthenticated", details: { code: "UNAUTHENTICATED" } }));
    expect(() => assertAdmin(withAdmin(undefined))).toThrowError(expect.objectContaining({ code: "permission-denied", details: { code: "NOT_ADMIN" } }));
    expect(() => assertAdmin(withAdmin("true"))).toThrowError(expect.objectContaining({ details: { code: "NOT_ADMIN" } }));
    expect(assertAdmin(withAdmin(true))).toBe("u1");
  });
});

describe("resolvePaymentReview (4.2)", () => {
  const review = { paymentStatus: "payment_review", review: { reason: "AMOUNT_MISMATCH", openedAt: T0 }, flow: flowState() };

  it("accept con reserva -> paid, anota la resolución y suma métricas", async () => {
    const env = setup(review);
    const res = await handleResolvePaymentReview(env.deps, { ...NUM, action: "accept", note: "Pago correcto en Flow" }, ADMIN_UID);
    expect(res).toEqual({ orderNumber: "NE-000001", paymentStatus: "paid" });
    expect(o(env)).toMatchObject({ paymentStatus: "paid", stockState: "committed" });
    expect(o(env)["review"]).toMatchObject({ reason: "AMOUNT_MISMATCH", resolution: "accepted", resolvedBy: ADMIN_UID, note: "Pago correcto en Flow" });
    expect(productStock(env.db, "1001").reserved).toBe(0);
    expect(day(env)).toMatchObject({ ordersCount: 1 });
  });

  it("accept con la reserva ya liberada y sin stock -> OUT_OF_STOCK y el pedido sigue en revisión", async () => {
    const env = setup({ ...review, stockState: "released" }, { s1001: 5, r1001: 0, s1002: 0, r1002: 0 });
    try {
      await handleResolvePaymentReview(env.deps, { ...NUM, action: "accept", note: "ok" }, ADMIN_UID);
      expect.unreachable();
    } catch (err) {
      expect(getAppErrorCode(err)).toBe("OUT_OF_STOCK");
      expect((err as { details: unknown }).details).toEqual({ code: "OUT_OF_STOCK", sku: "1002", available: 0 });
    }
    expect(o(env)["paymentStatus"]).toBe("payment_review");
    expect(productStock(env.db, "1001").stock).toBe(5);
  });

  it("accept con la reserva liberada y con stock -> paid re-reservando", async () => {
    const env = setup({ ...review, stockState: "released" }, { s1001: 5, r1001: 0, s1002: 5, r1002: 0 });
    await handleResolvePaymentReview(env.deps, { ...NUM, action: "accept", note: "ok" }, ADMIN_UID);
    expect(productStock(env.db, "1001").stock).toBe(3);
    expect(o(env)["stockState"]).toBe("committed");
  });

  it("cancel con reserva -> cancelled y libera el stock; con reserva ya liberada no repone", async () => {
    const env = setup(review);
    expect(await handleResolvePaymentReview(env.deps, { ...NUM, action: "cancel", note: "Reembolsado a mano en Flow" }, ADMIN_UID)).toEqual({ orderNumber: "NE-000001", paymentStatus: "cancelled" });
    expect(o(env)).toMatchObject({ paymentStatus: "cancelled", stockState: "released" });
    expect(o(env)["review"]).toMatchObject({ resolution: "cancelled", resolvedBy: ADMIN_UID });
    expect(productStock(env.db, "1001")).toEqual({ stock: 5, reserved: 0, inStock: true });

    const released = setup({ ...review, stockState: "released" }, { s1001: 5, r1001: 0, s1002: 5, r1002: 0 });
    await handleResolvePaymentReview(released.deps, { ...NUM, action: "cancel", note: "x" }, ADMIN_UID);
    expect(productStock(released.db, "1001").stock).toBe(5);
  });

  it("solo desde payment_review; resolver dos veces -> INVALID_TRANSITION; exige nota", async () => {
    const env = setup(review);
    await handleResolvePaymentReview(env.deps, { ...NUM, action: "cancel", note: "x" }, ADMIN_UID);
    expect(await codeOf(handleResolvePaymentReview(env.deps, { ...NUM, action: "accept", note: "x" }, ADMIN_UID))).toBe("INVALID_TRANSITION");
    for (const paymentStatus of ["pending_payment", "paid", "expired", "refunded"]) {
      expect(await codeOf(handleResolvePaymentReview(setup({ paymentStatus }).deps, { ...NUM, action: "accept", note: "x" }, ADMIN_UID)), paymentStatus).toBe("INVALID_TRANSITION");
    }
    expect(await codeOf(handleResolvePaymentReview(setup(review).deps, { ...NUM, action: "accept" }, ADMIN_UID))).toBe("INVALID_INPUT");
    expect(await codeOf(handleResolvePaymentReview(setup(review).deps, { ...NUM, action: "maybe", note: "x" }, ADMIN_UID))).toBe("INVALID_INPUT");
  });
});

describe("cancelOrder (4.3)", () => {
  it("pending_payment -> cancelled y libera el stock una sola vez", async () => {
    const env = setup();
    const res = await handleCancelOrder(env.deps, { ...NUM, reason: "Cliente no pagó" }, ADMIN_UID);
    expect(res).toEqual({ orderNumber: "NE-000001", paymentStatus: "cancelled", stockReleased: true });
    expect(productStock(env.db, "1001")).toEqual({ stock: 5, reserved: 0, inStock: true });
    expect(productStock(env.db, "1002")).toEqual({ stock: 3, reserved: 0, inStock: true });
    expect(o(env)).toMatchObject({ paymentStatus: "cancelled", stockState: "released" });
    const history = o(env)["statusHistory"] as { to: string; note?: string; by: string }[];
    expect(history[1]).toMatchObject({ to: "cancelled", note: "Cliente no pagó", by: ADMIN_UID });
  });

  it("ya cancelado: OK con stockReleased false y sin tocar nada (idempotente, también en paralelo)", async () => {
    const env = setup();
    const results = await Promise.all(Array.from({ length: 4 }, () => handleCancelOrder(env.deps, { ...NUM, reason: "x" }, ADMIN_UID)));
    expect(results.filter((r) => r.stockReleased)).toHaveLength(1);
    expect(productStock(env.db, "1001").stock).toBe(5); // repuesto una sola vez
  });

  it("paid, refunded, payment_review y expired -> INVALID_TRANSITION", async () => {
    for (const paymentStatus of ["paid", "refunded", "payment_review", "expired"]) {
      expect(await codeOf(handleCancelOrder(setup({ paymentStatus }).deps, { ...NUM, reason: "x" }, ADMIN_UID)), paymentStatus).toBe("INVALID_TRANSITION");
    }
  });

  it("exige motivo de 1 a 300 caracteres", async () => {
    const env = setup();
    for (const reason of [undefined, "", "a".repeat(301)]) {
      expect(await codeOf(handleCancelOrder(env.deps, { ...NUM, reason }, ADMIN_UID))).toBe("INVALID_INPUT");
    }
  });
});

describe("updateFulfillment (4.4)", () => {
  const paid = () => setup(paidOrderDoc());

  it("avanza preparing -> on_route -> delivered y registra quién y cuándo", async () => {
    const env = paid();
    expect(await handleUpdateFulfillment(env.deps, { ...NUM, to: "on_route", note: "Chofer Juan" }, ADMIN_UID)).toEqual({
      orderNumber: "NE-000001",
      fulfillmentStatus: "on_route",
      changed: true,
      direction: "forward",
    });
    await handleUpdateFulfillment(env.deps, { ...NUM, to: "delivered" }, ADMIN_UID);
    expect(o(env)["fulfillmentStatus"]).toBe("delivered");
    const history = o(env)["statusHistory"] as { kind: string; to: string; by: string; note?: string }[];
    expect(history.filter((h) => h.kind === "fulfillment").map((h) => h.to)).toEqual(["on_route", "delivered"]);
    expect(history.find((h) => h.to === "on_route")).toMatchObject({ by: ADMIN_UID, note: "Chofer Juan" });
  });

  it("mismo estado: changed false, direction none y sin entrada nueva ni escritura", async () => {
    const env = paid();
    const before = env.db.commits;
    const histBefore = (o(env)["statusHistory"] as unknown[]).length;
    expect(await handleUpdateFulfillment(env.deps, { ...NUM, to: "preparing" }, ADMIN_UID)).toMatchObject({ changed: false, direction: "none" });
    expect(env.db.commits).toBe(before);
    expect((o(env)["statusHistory"] as unknown[]).length).toBe(histBefore);
  });

  it("retroceso de un paso con motivo queda con direction backward; sin motivo -> REASON_REQUIRED; dos pasos -> INVALID_TRANSITION", async () => {
    const env = paid();
    await handleUpdateFulfillment(env.deps, { ...NUM, to: "on_route" }, ADMIN_UID);
    await handleUpdateFulfillment(env.deps, { ...NUM, to: "delivered" }, ADMIN_UID);
    expect(await codeOf(handleUpdateFulfillment(env.deps, { ...NUM, to: "on_route" }, ADMIN_UID))).toBe("REASON_REQUIRED");
    expect(await codeOf(handleUpdateFulfillment(env.deps, { ...NUM, to: "preparing", reason: "x" }, ADMIN_UID))).toBe("INVALID_TRANSITION");
    expect(await handleUpdateFulfillment(env.deps, { ...NUM, to: "on_route", reason: "Clic equivocado" }, ADMIN_UID)).toMatchObject({ changed: true, direction: "backward" });
    const history = o(env)["statusHistory"] as DocData[];
    expect(history.at(-1)).toMatchObject({ kind: "fulfillment", from: "delivered", to: "on_route", direction: "backward", reason: "Clic equivocado", by: ADMIN_UID });
  });

  it("(i) pedido no pagado o reembolsado -> ORDER_NOT_PAID", async () => {
    for (const paymentStatus of ["pending_payment", "refunded", "cancelled", "payment_review"]) {
      expect(await codeOf(handleUpdateFulfillment(setup({ paymentStatus }).deps, { ...NUM, to: "on_route" }, ADMIN_UID)), paymentStatus).toBe("ORDER_NOT_PAID");
    }
  });

  it("retiro: ready_for_pickup sí, on_route no", async () => {
    const env = setup(paidOrderDoc({ delivery: { type: "pickup", storeAddress: "a", storeHours: "h" } }));
    expect(await codeOf(handleUpdateFulfillment(env.deps, { ...NUM, to: "on_route" }, ADMIN_UID))).toBe("INVALID_TRANSITION");
    expect(await handleUpdateFulfillment(env.deps, { ...NUM, to: "ready_for_pickup" }, ADMIN_UID)).toMatchObject({ changed: true });
  });

  it("entrada inválida", async () => {
    const env = paid();
    for (const bad of [{ ...NUM, to: "volando" }, { ...NUM }, { ...NUM, to: "on_route", reason: "a".repeat(301) }]) {
      expect(await codeOf(handleUpdateFulfillment(env.deps, bad, ADMIN_UID))).toBe("INVALID_INPUT");
    }
  });
});

describe("recordManualRefund (9b)", () => {
  it("B1: method 'flow' en un pedido pagado por transferencia -> INVALID_INPUT, sin cambios; 'transfer' en uno de Flow sí se acepta", async () => {
    const tr = makeEnv({ "orders/NE-000001": paidOrderDoc({ paymentMethod: "transfer" }) });
    tr.clock.advance(2 * 3600_000);
    expect(await codeOf(handleRecordManualRefund(tr.deps, refundReq({ method: "flow" }), ADMIN_UID))).toBe("INVALID_INPUT");
    expect((tr.db.peek("orders/NE-000001") as DocData)["paymentStatus"]).toBe("paid");
    const fl = makeEnv({ "orders/NE-000001": paidOrderDoc({ paymentMethod: "flow", flow: flowState() }) });
    fl.clock.advance(2 * 3600_000);
    const res = await handleRecordManualRefund(fl.deps, refundReq({ method: "transfer", restock: false }), ADMIN_UID);
    expect(res.alreadyRefunded).toBe(false);
  });

  const refundReq = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    ...NUM,
    amount: 32762,
    method: "flow",
    refundedAt: new Date(T0.getTime() + 3600_000).toISOString(),
    note: "Devuelto desde el panel de Flow",
    restock: true,
    ...over,
  });
  /** Pedido pagado el día de T0 con métricas ya sumadas por el pago. */
  const paidEnv = (): TestEnv => {
    const env = setup(paidOrderDoc(), { s1001: 3, r1001: 0, s1002: 2, r1002: 0 });
    env.db.seed("metrics/daily/days/2026-10-20", { date: "2026-10-20", ordersCount: 1, revenue: 32762, merchandise: 28772, unitsSold: 3, refundsCount: 0, refundedAmount: 0 });
    env.db.seed("metrics/products/items/1001", { sku: "1001", name: "x", unitsSold: 2, revenue: 19782 });
    env.db.seed("metrics/products/items/1002", { sku: "1002", name: "y", unitsSold: 1, revenue: 8990 });
    env.clock.advance(2 * 3600_000);
    return env;
  };

  it("(a) total con restock: refunded, stock repuesto, released y métricas D-025", async () => {
    const env = paidEnv();
    const res = await handleRecordManualRefund(env.deps, refundReq(), ADMIN_UID);
    expect(res).toEqual({ orderNumber: "NE-000001", paymentStatus: "refunded", alreadyRefunded: false, restocked: true });
    expect(o(env)).toMatchObject({ paymentStatus: "refunded", stockState: "released", fulfillmentStatus: "preparing" });
    expect(o(env)["refund"]).toMatchObject({ amount: 32762, method: "flow", restock: true, restocked: true, recordedBy: ADMIN_UID, note: "Devuelto desde el panel de Flow" });
    expect(productStock(env.db, "1001")).toEqual({ stock: 5, reserved: 0, inStock: true });
    expect(productStock(env.db, "1002")).toEqual({ stock: 3, reserved: 0, inStock: true });
    expect(day(env)).toEqual({ date: "2026-10-20", ordersCount: 1, revenue: 0, merchandise: 28772, unitsSold: 0, refundsCount: 1, refundedAmount: 32762, commission: 0, updatedAt: env.clock() });
    expect(env.db.peek("metrics/products/items/1001")).toMatchObject({ unitsSold: 0, revenue: 0 });
    expect(env.db.peek("metrics/products/items/1002")).toMatchObject({ unitsSold: 0, revenue: 0 });
  });

  it("(a2) parcial con restock: revenue baja solo amount, unidades sí", async () => {
    const env = paidEnv();
    await handleRecordManualRefund(env.deps, refundReq({ amount: 10000 }), ADMIN_UID);
    expect(day(env)).toMatchObject({ ordersCount: 1, revenue: 22762, merchandise: 28772, unitsSold: 0, refundsCount: 1, refundedAmount: 10000 });
  });

  it("(b) total sin restock: stock y stockState intactos; unidades y métricas por SKU intactas", async () => {
    const env = paidEnv();
    const res = await handleRecordManualRefund(env.deps, refundReq({ restock: false }), ADMIN_UID);
    expect(res.restocked).toBe(false);
    expect(o(env)).toMatchObject({ paymentStatus: "refunded", stockState: "committed" });
    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 0, inStock: true });
    expect(day(env)).toMatchObject({ ordersCount: 1, revenue: 0, unitsSold: 3, refundsCount: 1, refundedAmount: 32762 });
    expect(env.db.peek("metrics/products/items/1001")).toMatchObject({ unitsSold: 2, revenue: 19782 });
  });

  it("(b2) parcial sin restock: el ticket promedio neto es revenue / ordersCount", async () => {
    const env = paidEnv();
    await handleRecordManualRefund(env.deps, refundReq({ amount: 2762, restock: false }), ADMIN_UID);
    const d = day(env) as { revenue: number; ordersCount: number };
    expect(d).toMatchObject({ revenue: 30000, ordersCount: 1, unitsSold: 3, refundedAmount: 2762 });
    expect(d.revenue / d.ordersCount).toBe(30000);
  });

  it("(b3) el reembolso se asienta en el día de paidAt aunque refundedAt caiga otro día", async () => {
    const env = paidEnv();
    env.clock.advance(5 * 24 * 3600_000);
    await handleRecordManualRefund(env.deps, refundReq({ refundedAt: new Date(env.clock().getTime() - 3600_000).toISOString() }), ADMIN_UID);
    expect(day(env)).toMatchObject({ refundsCount: 1 });
    expect(env.db.paths("metrics/daily/")).toEqual(["metrics/daily/days/2026-10-20"]);
  });

  it("(c) misma llamada 5 veces (también en paralelo): una sola reposición y un solo ajuste", async () => {
    const env = paidEnv();
    const results = await Promise.all(Array.from({ length: 5 }, () => handleRecordManualRefund(env.deps, refundReq(), ADMIN_UID)));
    expect(results.filter((r) => !r.alreadyRefunded)).toHaveLength(1);
    expect(results.filter((r) => r.alreadyRefunded)).toHaveLength(4);
    expect(results.every((r) => r.restocked)).toBe(true);
    expect(productStock(env.db, "1001")).toEqual({ stock: 5, reserved: 0, inStock: true });
    expect(day(env)).toMatchObject({ refundsCount: 1, refundedAmount: 32762, revenue: 0 });

    // Y en serie, aun con parámetros distintos, no escribe nada.
    const before = env.db.commits;
    const again = await handleRecordManualRefund(env.deps, refundReq({ amount: 1, restock: false, note: "otra" }), ADMIN_UID);
    expect(again).toMatchObject({ alreadyRefunded: true, restocked: true });
    expect(env.db.commits).toBe(before);
  });

  it("(d) desde pending_payment, expired, cancelled y payment_review -> INVALID_TRANSITION", async () => {
    for (const paymentStatus of ["pending_payment", "expired", "cancelled", "payment_review"]) {
      const env = setup({ paymentStatus });
      expect(await codeOf(handleRecordManualRefund(env.deps, refundReq(), ADMIN_UID)), paymentStatus).toBe("INVALID_TRANSITION");
    }
  });

  it("(e) monto 0, negativo, decimal o mayor que total -> INVALID_REFUND_AMOUNT, sin escribir", async () => {
    const env = paidEnv();
    const before = env.db.commits;
    for (const amount of [0, -5, 10.5, 32763]) {
      expect(await codeOf(handleRecordManualRefund(env.deps, refundReq({ amount }), ADMIN_UID)), String(amount)).toBe("INVALID_REFUND_AMOUNT");
    }
    expect(env.db.commits).toBe(before);
  });

  it("(f) fecha futura o anterior a paidAt -> INVALID_REFUND_DATE", async () => {
    const env = paidEnv();
    const future = new Date(env.clock().getTime() + 10 * 60_000).toISOString();
    const beforePaid = new Date(T0.getTime() - 1000).toISOString();
    expect(await codeOf(handleRecordManualRefund(env.deps, refundReq({ refundedAt: future }), ADMIN_UID))).toBe("INVALID_REFUND_DATE");
    expect(await codeOf(handleRecordManualRefund(env.deps, refundReq({ refundedAt: beforePaid }), ADMIN_UID))).toBe("INVALID_REFUND_DATE");
  });

  it("(g) falta note, restock o method, o hay campos extra -> INVALID_INPUT", async () => {
    const env = paidEnv();
    for (const missing of ["note", "restock", "method", "refundedAt", "amount"]) {
      const req = refundReq();
      delete req[missing];
      expect(await codeOf(handleRecordManualRefund(env.deps, req, ADMIN_UID)), missing).toBe("INVALID_INPUT");
    }
    for (const bad of [{ note: "" }, { note: "a".repeat(301) }, { restock: "yes" }, { method: "cash" }, { refundedAt: "ayer" }, { amount: "100" }, { extra: 1 }]) {
      expect(await codeOf(handleRecordManualRefund(env.deps, refundReq(bad), ADMIN_UID)), JSON.stringify(bad)).toBe("INVALID_INPUT");
    }
  });

  it("(i) tras refunded fallan updateFulfillment y cancelOrder", async () => {
    const env = paidEnv();
    await handleRecordManualRefund(env.deps, refundReq(), ADMIN_UID);
    expect(await codeOf(handleUpdateFulfillment(env.deps, { ...NUM, to: "on_route" }, ADMIN_UID))).toBe("ORDER_NOT_PAID");
    expect(await codeOf(handleCancelOrder(env.deps, { ...NUM, reason: "x" }, ADMIN_UID))).toBe("INVALID_TRANSITION");
  });

  it("(D-029i) repone stock en un producto ELIMINADO sin revivirlo", async () => {
    const env = paidEnv();
    const deleted = { ...(env.db.peek("products/1001") as DocData), published: false, deletedAt: new Date("2026-10-10T00:00:00Z"), deletedBy: "uid" };
    env.db.seed("products/1001", deleted);
    await handleRecordManualRefund(env.deps, refundReq(), ADMIN_UID);
    const p = env.db.peek("products/1001") as DocData;
    expect(p["stock"]).toBe(5);
    expect(p["published"]).toBe(false);
    expect(p["deletedAt"]).toEqual(new Date("2026-10-10T00:00:00Z"));
  });

  it("un producto que ya no existe no impide el reembolso", async () => {
    const env = paidEnv();
    const db = env.db;
    // Simula la ausencia de 1002 creando el pedido sin ese documento.
    const noP2 = makeEnv({ "orders/NE-000001": paidOrderDoc(), "products/1001": db.peek("products/1001") as DocData });
    noP2.clock.advance(3600_000);
    const res = await handleRecordManualRefund(noP2.deps, refundReq(), ADMIN_UID);
    expect(res).toMatchObject({ paymentStatus: "refunded", restocked: true });
    expect(noP2.db.peek("products/1002")).toBeDefined(); // lo creó makeEnv por defecto; no se tocó por el pedido
  });
});
