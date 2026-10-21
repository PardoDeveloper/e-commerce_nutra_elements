import { describe, expect, it, vi } from "vitest";
import type { DocData } from "../common/db.js";
import { MemoryDb } from "../common/testing/memory-db.js";
import { flowState, makeEnv, orderDoc, productDoc, productStock, SETTINGS_PRIVATE, T0, type TestEnv } from "../orders/testing/fixtures.js";
import { applyFlowStatus } from "./apply-status.js";
import { FlowApiError } from "./flow-client.js";
import { handleFlowConfirm, type FlowConfirmDeps } from "./flow-confirm.js";
import { FakeFlow } from "./testing/fake-flow.js";

// Pruebas de flowConfirm / rutina de pago con un cliente de Flow SIMULADO y Firestore EN MEMORIA.
// Verifican la lógica de idempotencia y transiciones; no prueban Flow real ni Firestore real.

const logCalls = vi.hoisted(() => [] as unknown[][]);
vi.mock("firebase-functions/logger", () => ({
  debug: (...a: unknown[]) => logCalls.push(a),
  info: (...a: unknown[]) => logCalls.push(a),
  warn: (...a: unknown[]) => logCalls.push(a),
  error: (...a: unknown[]) => logCalls.push(a),
}));

interface Setup {
  env: TestEnv;
  flow: FakeFlow;
  deps: FlowConfirmDeps;
}

/** Pedido NE-000001 de Flow (2 x 1001 + 1 x 1002, total 32.762) con la reserva ya descontada del stock. */
function setup(orderOverrides: DocData = {}, productOverrides: { p1001?: DocData; p1002?: DocData } = {}): Setup {
  const env = makeEnv({
    "orders/NE-000001": orderDoc({ flow: flowState(), ...orderOverrides }),
    "products/1001": productDoc("1001", { stock: 3, reserved: 2, name: "Citrato de Magnesio x 120", price: 10990, ...productOverrides.p1001 }),
    "products/1002": productDoc("1002", { stock: 2, reserved: 1, name: "Vitamina C x 60", price: 8990, ...productOverrides.p1002 }),
  });
  const flow = new FakeFlow();
  flow.setStatus("TOKEN1", { commerceOrder: "NE-000001" });
  return { env, flow, deps: { ...env.deps, getFlow: () => flow } };
}

const post = (token: unknown = "TOKEN1") => ({ method: "POST", body: { token } });
const orderOf = (db: MemoryDb) => db.peek("orders/NE-000001") as DocData;
const metricsDay = (db: MemoryDb) => db.peek("metrics/daily/days/2026-10-20");

describe("flowConfirm (test 6)", () => {
  it("(a) pago correcto -> paid, preparing, stock confirmado y métricas +1", async () => {
    const { env, deps } = setup();
    const res = await handleFlowConfirm(deps, post());
    expect(res).toEqual({ status: 200 });

    const o = orderOf(env.db);
    expect(o).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "preparing", stockState: "committed" });
    expect(o["paidAt"]).toEqual(env.clock());
    expect(o["flow"]).toMatchObject({ token: "TOKEN1", lastStatus: 2, amountPaid: 32762, paidFlowOrder: 111 });
    // reserved baja, stock queda como estaba
    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 0, inStock: true });
    expect(productStock(env.db, "1002")).toEqual({ stock: 2, reserved: 0, inStock: true });
    expect(metricsDay(env.db)).toMatchObject({ date: "2026-10-20", ordersCount: 1, revenue: 32762, merchandise: 28772, unitsSold: 3, refundsCount: 0, refundedAmount: 0 });
    expect(env.db.peek("metrics/products/items/1001")).toMatchObject({ unitsSold: 2, revenue: 19782 });
    expect(env.db.peek("metrics/products/items/1002")).toMatchObject({ unitsSold: 1, revenue: 8990 });
    expect(env.db.peek("paymentEvents/TOKEN1")).toMatchObject({ token: "TOKEN1", orderNumber: "NE-000001", flowOrder: 111, flowStatus: 2, amount: 32762, outcome: "paid", receivedCount: 1 });
  });

  it("(b) la misma confirmación 5 veces seguidas: un solo paid, métricas +1, receivedCount 5", async () => {
    const { env, deps } = setup();
    for (let i = 0; i < 5; i++) expect(await handleFlowConfirm(deps, post())).toEqual({ status: 200 });
    expect(metricsDay(env.db)).toMatchObject({ ordersCount: 1, revenue: 32762 });
    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 0, inStock: true });
    expect((orderOf(env.db)["statusHistory"] as unknown[]).length).toBe(3); // creado + paid + preparing, sin entradas repetidas
    expect(env.db.peek("paymentEvents/TOKEN1")).toMatchObject({ outcome: "paid", receivedCount: 5 });
  });

  it("(b) la misma confirmación 5 veces EN PARALELO (sobre el doble): un solo paid, métricas +1", async () => {
    const { env, deps } = setup();
    const results = await Promise.all(Array.from({ length: 5 }, () => handleFlowConfirm(deps, post())));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(metricsDay(env.db)).toMatchObject({ ordersCount: 1, revenue: 32762, unitsSold: 3 });
    expect(productStock(env.db, "1001").reserved).toBe(0);
    expect(env.db.peek("paymentEvents/TOKEN1")).toMatchObject({ outcome: "paid", receivedCount: 5 });
  });

  it("(c) monto distinto -> payment_review, la reserva se mantiene y no se marca pagado", async () => {
    const { env, flow, deps } = setup();
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", amount: 100 });
    expect(await handleFlowConfirm(deps, post())).toEqual({ status: 200 });
    const o = orderOf(env.db);
    expect(o).toMatchObject({ paymentStatus: "payment_review", stockState: "reserved", paidAt: null, fulfillmentStatus: null });
    expect(o["review"]).toMatchObject({ reason: "AMOUNT_MISMATCH" });
    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 2, inStock: true });
    expect(metricsDay(env.db)).toBeUndefined();
    expect(env.db.peek("paymentEvents/TOKEN1")).toMatchObject({ outcome: "payment_review" });
  });

  it("(c) moneda distinta -> payment_review CURRENCY_MISMATCH; monto con decimales también es distinto", async () => {
    const a = setup();
    a.flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", currency: "USD" });
    await handleFlowConfirm(a.deps, post());
    expect(orderOf(a.env.db)["review"]).toMatchObject({ reason: "CURRENCY_MISMATCH" });

    const b = setup();
    b.flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", amount: 32762.5 });
    await handleFlowConfirm(b.deps, post());
    expect(orderOf(b.env.db)["paymentStatus"]).toBe("payment_review");
  });

  it("(d) pago tardío con stock -> paid, descontando stock libre", async () => {
    const { env, deps } = setup(
      { paymentStatus: "expired", stockState: "released" },
      { p1001: { stock: 5, reserved: 0 }, p1002: { stock: 4, reserved: 0 } },
    );
    expect(await handleFlowConfirm(deps, post())).toEqual({ status: 200 });
    expect(orderOf(env.db)).toMatchObject({ paymentStatus: "paid", stockState: "committed", fulfillmentStatus: "preparing" });
    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 0, inStock: true });
    expect(productStock(env.db, "1002")).toEqual({ stock: 3, reserved: 0, inStock: true });
    expect(metricsDay(env.db)).toMatchObject({ ordersCount: 1 });
  });

  it("(e) pago tardío sin stock -> payment_review NO_STOCK_AFTER_EXPIRY, sin tocar el stock", async () => {
    const { env, deps } = setup(
      { paymentStatus: "expired", stockState: "released" },
      { p1001: { stock: 1, reserved: 0 }, p1002: { stock: 4, reserved: 0 } },
    );
    await handleFlowConfirm(deps, post());
    expect(orderOf(env.db)).toMatchObject({ paymentStatus: "payment_review", stockState: "released" });
    expect(orderOf(env.db)["review"]).toMatchObject({ reason: "NO_STOCK_AFTER_EXPIRY" });
    expect(productStock(env.db, "1001").stock).toBe(1);
    expect(productStock(env.db, "1002").stock).toBe(4);
    expect(metricsDay(env.db)).toBeUndefined();
  });

  it("(f) pedido cancelado que recibe un pago -> payment_review PAID_AFTER_CANCEL", async () => {
    const { env, deps } = setup({ paymentStatus: "cancelled", stockState: "released" });
    await handleFlowConfirm(deps, post());
    expect(orderOf(env.db)).toMatchObject({ paymentStatus: "payment_review", stockState: "released" });
    expect(orderOf(env.db)["review"]).toMatchObject({ reason: "PAID_AFTER_CANCEL" });
  });

  it("un pedido reembolsado nunca vuelve a paid", async () => {
    const { env, deps } = setup({ paymentStatus: "refunded", stockState: "committed", fulfillmentStatus: "preparing", paidAt: T0 });
    expect(await handleFlowConfirm(deps, post())).toEqual({ status: 200 });
    expect(orderOf(env.db)["paymentStatus"]).toBe("refunded");
    expect(metricsDay(env.db)).toBeUndefined();
  });

  it("(g) token desconocido para Flow (firma/token inválidos) -> 400 y sin cambios", async () => {
    const { env, deps } = setup();
    const before = env.db.peek("orders/NE-000001");
    expect(await handleFlowConfirm(deps, post("OTROTOKEN"))).toEqual({ status: 400 });
    expect(env.db.peek("orders/NE-000001")).toEqual(before);
    expect(env.db.paths("paymentEvents/")).toEqual([]);
    expect(metricsDay(env.db)).toBeUndefined();
  });

  it("(g) cuerpo inválido -> 400 sin llamar a Flow; método distinto de POST -> 405", async () => {
    const { flow, deps } = setup();
    for (const token of [undefined, "", "a".repeat(101), "../orders/NE-000001", "tok en", 5, null, { x: 1 }]) {
      expect(await handleFlowConfirm(deps, { method: "POST", body: { token } })).toEqual({ status: 400 });
    }
    expect(await handleFlowConfirm(deps, { method: "POST", body: undefined })).toEqual({ status: 400 });
    expect(await handleFlowConfirm(deps, { method: "POST", body: "token=abc" })).toEqual({ status: 400 });
    expect(flow.statusCalls).toEqual([]);
    for (const method of ["GET", "PUT", "DELETE", "HEAD"]) {
      expect(await handleFlowConfirm(deps, { method, body: { token: "TOKEN1" } })).toEqual({ status: 405, allow: "POST" });
    }
  });

  it("(g) el cuerpo no manda: campos extra como amount o status se ignoran", async () => {
    const { env, flow, deps } = setup();
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 1 });
    await handleFlowConfirm(deps, { method: "POST", body: { token: "TOKEN1", status: 2, amount: 32762, commerceOrder: "NE-000001" } });
    expect(orderOf(env.db)["paymentStatus"]).toBe("pending_payment");
  });

  it("(h) estado pendiente -> sigue pending_payment, registra flow.lastStatus; rechazado/anulado igual", async () => {
    for (const [status, outcome] of [[1, "pending"], [3, "rejected"], [4, "rejected"]] as const) {
      const { env, flow, deps } = setup();
      flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status });
      expect(await handleFlowConfirm(deps, post())).toEqual({ status: 200 });
      expect(orderOf(env.db)).toMatchObject({ paymentStatus: "pending_payment", stockState: "reserved" });
      expect(orderOf(env.db)["flow"]).toMatchObject({ lastStatus: status, lastCheckedAt: env.clock() });
      expect(env.db.peek("paymentEvents/TOKEN1")).toMatchObject({ outcome, flowStatus: status });
      expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 2, inStock: true });
      expect(metricsDay(env.db)).toBeUndefined();
    }
  });

  it("un pago que llega después de un 'pendiente' sí confirma (el resultado final no se pierde)", async () => {
    const { env, flow, deps } = setup();
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 1 });
    await handleFlowConfirm(deps, post());
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 2 });
    await handleFlowConfirm(deps, post());
    expect(orderOf(env.db)["paymentStatus"]).toBe("paid");
    expect(env.db.peek("paymentEvents/TOKEN1")).toMatchObject({ outcome: "paid", receivedCount: 2 });
  });

  it("un 'pendiente' tardío no degrada un pago ya confirmado", async () => {
    const { env, flow, deps } = setup();
    await handleFlowConfirm(deps, post());
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 1 });
    await handleFlowConfirm(deps, post());
    expect(orderOf(env.db)["paymentStatus"]).toBe("paid");
    expect(env.db.peek("paymentEvents/TOKEN1")).toMatchObject({ outcome: "paid" });
  });

  it("segundo pago (otro token y otro flowOrder) del mismo pedido: duplicate, anotado una sola vez para revisión", async () => {
    const { env, flow, deps } = setup();
    await handleFlowConfirm(deps, post());
    flow.setStatus("TOKEN2", { commerceOrder: "NE-000001", flowOrder: 222 });
    for (let i = 0; i < 3; i++) expect(await handleFlowConfirm(deps, post("TOKEN2"))).toEqual({ status: 200 });

    const o = orderOf(env.db);
    expect(o["paymentStatus"]).toBe("paid");
    const dups = (o["statusHistory"] as { note?: string }[]).filter((h) => h.note === "DUPLICATE_PAYMENT");
    expect(dups).toHaveLength(1);
    expect(env.db.peek("paymentEvents/TOKEN2")).toMatchObject({ outcome: "duplicate", receivedCount: 3, warnings: ["DUPLICATE_PAYMENT"] });
    expect(metricsDay(env.db)).toMatchObject({ ordersCount: 1, revenue: 32762 }); // no suma dos veces
  });

  it("A1: segundo pago sobre un pedido en payment_review o refunded se anota una sola vez", async () => {
    const cases: [string, DocData][] = [
      ["payment_review", { paymentStatus: "payment_review", stockState: "reserved", review: { reason: "AMOUNT_MISMATCH", openedAt: T0 } }],
      ["refunded", { paymentStatus: "refunded", stockState: "committed", fulfillmentStatus: "preparing", paidAt: T0 }],
    ];
    for (const [status, overrides] of cases) {
      const { env, flow, deps } = setup({ ...overrides, flow: flowState({ paidFlowOrder: 111 }) });
      flow.setStatus("TOKEN2", { commerceOrder: "NE-000001", flowOrder: 222 });
      for (let i = 0; i < 3; i++) expect(await handleFlowConfirm(deps, post("TOKEN2"))).toEqual({ status: 200 });

      const o = orderOf(env.db);
      expect(o["paymentStatus"], status).toBe(status);
      const dups = (o["statusHistory"] as { note?: string; from?: string; to?: string }[]).filter((h) => h.note === "DUPLICATE_PAYMENT");
      expect(dups, status).toHaveLength(1);
      expect(dups[0]).toMatchObject({ from: status, to: status });
      expect(env.db.peek("paymentEvents/TOKEN2"), status).toMatchObject({ outcome: "duplicate", receivedCount: 3, warnings: ["DUPLICATE_PAYMENT"] });
      expect(metricsDay(env.db), status).toBeUndefined();
    }
  });

  it("A1: el mismo flowOrder reentregado en payment_review no es un duplicado", async () => {
    const { env, deps } = setup({ paymentStatus: "payment_review", review: { reason: "AMOUNT_MISMATCH", openedAt: T0 }, flow: flowState({ paidFlowOrder: 111 }) });
    await handleFlowConfirm(deps, post());
    const history = orderOf(env.db)["statusHistory"] as { note?: string }[];
    expect(history.some((h) => h.note === "DUPLICATE_PAYMENT")).toBe(false);
    expect(env.db.peek("paymentEvents/TOKEN1")?.["warnings"]).toBeUndefined();
  });

  it("pedido desconocido o sin pago de Flow creado -> 400", async () => {
    const { flow, deps } = setup();
    flow.setStatus("TOKENX", { commerceOrder: "NE-000999" });
    expect(await handleFlowConfirm(deps, post("TOKENX"))).toEqual({ status: 400 });
    flow.setStatus("TOKENY", { commerceOrder: "no-es-un-pedido" });
    expect(await handleFlowConfirm(deps, post("TOKENY"))).toEqual({ status: 400 });
    // Pedido sin flow creado: nadie pudo generar ese token a través de nosotros.
    const noFlow = setup({ flow: null });
    expect(await handleFlowConfirm(noFlow.deps, post())).toEqual({ status: 400 });
  });

  it("pedido de transferencia: Flow no puede pagarlo -> 400", async () => {
    const { deps } = setup({ paymentMethod: "transfer" });
    expect(await handleFlowConfirm(deps, post())).toEqual({ status: 400 });
  });

  it("reintento con sufijo (NE-000001-2) resuelve el pedido; un sufijo mayor al intento actual no", async () => {
    const { env, flow, deps } = setup({ flow: flowState({ token: "TOKEN2", attempt: 2, commerceOrder: "NE-000001-2" }) });
    flow.setStatus("TOKEN2", { commerceOrder: "NE-000001-2" });
    expect(await handleFlowConfirm(deps, post("TOKEN2"))).toEqual({ status: 200 });
    expect(orderOf(env.db)["paymentStatus"]).toBe("paid");

    const other = setup({ flow: flowState({ attempt: 1 }) });
    other.flow.setStatus("TOKEN9", { commerceOrder: "NE-000001-5" });
    expect(await handleFlowConfirm(other.deps, post("TOKEN9"))).toEqual({ status: 400 });
  });

  it("un intento viejo rechazado no pisa el estado del intento vigente", async () => {
    const { env, flow, deps } = setup({ flow: flowState({ token: "TOKEN2", attempt: 2, commerceOrder: "NE-000001-2", lastStatus: 1 }) });
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 3 });
    await handleFlowConfirm(deps, post("TOKEN1"));
    expect((orderOf(env.db)["flow"] as DocData)["lastStatus"]).toBe(1);
    expect(env.db.peek("paymentEvents/TOKEN1")).toMatchObject({ outcome: "rejected" });
  });

  it("un pago del intento viejo (otro token) sí confirma el pedido", async () => {
    const { env, flow, deps } = setup({ flow: flowState({ token: "TOKEN2", attempt: 2, commerceOrder: "NE-000001-2" }) });
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 2 });
    await handleFlowConfirm(deps, post("TOKEN1"));
    expect(orderOf(env.db)["paymentStatus"]).toBe("paid");
    expect((orderOf(env.db)["flow"] as DocData)["token"]).toBe("TOKEN2"); // el token vigente no cambia
  });

  it("fallos de red hacia Flow o de Firestore -> 500 (Flow reintenta); 'client' -> 400", async () => {
    const { flow, deps } = setup();
    flow.failWith = new FlowApiError("unavailable", 503);
    expect(await handleFlowConfirm(deps, post())).toEqual({ status: 500 });
    flow.failWith = new FlowApiError("client", 401, 1620);
    expect(await handleFlowConfirm(deps, post())).toEqual({ status: 400 });
    flow.failWith = undefined;

    const broken = { ...deps, db: { ...deps.db, runTransaction: () => Promise.reject(new Error("firestore caído")) } as unknown as FlowConfirmDeps["db"] };
    expect(await handleFlowConfirm(broken, post())).toEqual({ status: 500 });
    expect(await handleFlowConfirm({ ...deps, getFlow: () => { throw new Error("config"); } }, post())).toEqual({ status: 500 });
  });

  it("no registra el token de Flow, ni correo, ni RUT en los logs", async () => {
    logCalls.length = 0;
    const { deps } = setup();
    await handleFlowConfirm(deps, post());
    await handleFlowConfirm(deps, post("OTROTOKEN"));
    const logged = JSON.stringify(logCalls);
    expect(logged).toContain("NE-000001");
    for (const secret of ["TOKEN1", "OTROTOKEN", "ana@example.com", "12345678"]) expect(logged).not.toContain(secret);
  });
});

describe("flowConfirm: límite de uso por IP (M1)", () => {
  const withIp = (ip: string | undefined, token: unknown = "TOKEN1") => ({ method: "POST", body: { token }, ip });
  const setLimit = (env: TestEnv, n: number) =>
    env.db.seed("settings/private", { ...SETTINGS_PRIVATE, limits: { ...(SETTINGS_PRIVATE["limits"] as object), flowConfirmPerIpPer10Min: n } });

  it("pasado el máximo por IP responde 429 sin llamar a Flow; otra IP y la ventana siguiente sí pasan", async () => {
    const { env, flow, deps } = setup();
    setLimit(env, 2);
    expect(await handleFlowConfirm(deps, withIp("203.0.113.9"))).toEqual({ status: 200 });
    expect(await handleFlowConfirm(deps, withIp("203.0.113.9"))).toEqual({ status: 200 });
    expect(await handleFlowConfirm(deps, withIp("203.0.113.9"))).toEqual({ status: 429 });
    expect(flow.statusCalls).toHaveLength(2);
    expect(await handleFlowConfirm(deps, withIp("198.51.100.4"))).toEqual({ status: 200 });
    env.clock.advance(10 * 60_000);
    expect(await handleFlowConfirm(deps, withIp("203.0.113.9"))).toEqual({ status: 200 });
    expect(env.db.paths("rateLimits/").join("")).not.toContain("203.0.113");
  });

  it("el valor por defecto es holgado (300) y configurable en settings/private.limits", async () => {
    const { env, deps } = setup();
    for (let i = 0; i < 20; i++) expect((await handleFlowConfirm(deps, withIp("203.0.113.9"))).status).toBe(200);
    setLimit(env, 1);
    expect((await handleFlowConfirm(deps, withIp("203.0.113.77"))).status).toBe(200);
    expect((await handleFlowConfirm(deps, withIp("203.0.113.77"))).status).toBe(429);
  });

  it("un token con forma inválida se rechaza (400) sin consumir el límite, sin leer Firestore y sin llamar a Flow", async () => {
    const { env, flow, deps } = setup();
    setLimit(env, 1);
    for (let i = 0; i < 5; i++) expect(await handleFlowConfirm(deps, withIp("203.0.113.9", "../x"))).toEqual({ status: 400 });
    expect(flow.statusCalls).toEqual([]);
    expect(env.db.paths("rateLimits/")).toEqual([]);
    expect(await handleFlowConfirm(deps, withIp("203.0.113.9"))).toEqual({ status: 200 });
  });

  it("sin IP no se aplica el límite", async () => {
    const { env, deps } = setup();
    setLimit(env, 1);
    for (let i = 0; i < 3; i++) expect(await handleFlowConfirm(deps, withIp(undefined))).toEqual({ status: 200 });
    expect(env.db.paths("rateLimits/")).toEqual([]);
  });
});

describe("applyFlowStatus directo", () => {
  it("rechaza tokens con caracteres peligrosos (son ID de documento)", async () => {
    const { deps, flow } = setup();
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001" });
    const status = await flow.getStatus("TOKEN1");
    await expect(applyFlowStatus(deps, "a/b", status)).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("estados desconocidos de Flow se registran como ignored sin tocar el pedido", async () => {
    const { env, flow, deps } = setup();
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 9 });
    const status = await flow.getStatus("TOKEN1");
    expect(await applyFlowStatus(deps, "TOKEN1", status)).toEqual({ kind: "processed", outcome: "ignored", orderNumber: "NE-000001" });
    expect(orderOf(env.db)["paymentStatus"]).toBe("pending_payment");
  });
});
