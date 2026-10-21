import { describe, expect, it, vi } from "vitest";
import type { DocData } from "../common/db.js";
import { FlowApiError } from "../payments/flow-client.js";
import { makeCheckFlowPaid } from "../payments/runtime.js";
import { FakeFlow } from "../payments/testing/fake-flow.js";
import { FLOW_CHECK_GRACE_MS, MAX_CONSECUTIVE_FLOW_ERRORS, RELEASE_BATCH_LIMIT, releaseExpiredReservations, type FlowCheckResult, type ReleaseDeps } from "./release-expired.js";
import { flowState, makeEnv, orderDoc, productDoc, productStock, T0, type TestEnv } from "./testing/fixtures.js";

// releaseExpiredReservations (test 8) sobre el doble en memoria de Firestore.

vi.mock("firebase-functions/logger", () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }));

const THIRTY = 30 * 60_000;

/** Pedido NE-000001 pendiente con reserva ya descontada; el reloj arranca después del vencimiento. */
function setup(orderOverrides: DocData = {}, advanceMs = THIRTY + 1000): TestEnv {
  const env = makeEnv({
    "orders/NE-000001": orderDoc(orderOverrides),
    "products/1001": productDoc("1001", { name: "Citrato", stock: 3, reserved: 2 }),
    "products/1002": productDoc("1002", { name: "Vitamina C", stock: 2, reserved: 1 }),
  });
  env.clock.advance(advanceMs);
  return env;
}
const o = (env: TestEnv, n = "NE-000001") => env.db.peek(`orders/${n}`) as DocData;

describe("releaseExpiredReservations (4.5)", () => {
  it("libera una reserva vencida: expired, released y stock repuesto", async () => {
    const env = setup();
    const summary = await releaseExpiredReservations(env.deps);
    expect(summary).toEqual({ scanned: 1, expired: 1, paidInstead: 0, skipped: 0, failed: 0 });
    expect(o(env)).toMatchObject({ paymentStatus: "expired", stockState: "released" });
    expect(productStock(env.db, "1001")).toEqual({ stock: 5, reserved: 0, inStock: true });
    expect(productStock(env.db, "1002")).toEqual({ stock: 3, reserved: 0, inStock: true });
    const history = o(env)["statusHistory"] as { kind: string; to: string; by: string }[];
    expect(history.slice(-2)).toMatchObject([
      { kind: "payment", to: "expired", by: "system" },
      { kind: "stock", to: "released", by: "system" },
    ]);
  });

  it("idempotente: dos ejecuciones seguidas reponen una sola vez", async () => {
    const env = setup();
    await releaseExpiredReservations(env.deps);
    const second = await releaseExpiredReservations(env.deps);
    expect(second).toEqual({ scanned: 0, expired: 0, paidInstead: 0, skipped: 0, failed: 0 });
    expect(productStock(env.db, "1001").stock).toBe(5);
  });

  it("dos ejecuciones SIMULTÁNEAS tampoco reponen dos veces", async () => {
    const env = setup();
    const [a, b] = await Promise.all([releaseExpiredReservations(env.deps), releaseExpiredReservations(env.deps)]);
    expect(a.expired + b.expired).toBe(1);
    expect(productStock(env.db, "1001")).toEqual({ stock: 5, reserved: 0, inStock: true });
    expect(productStock(env.db, "1002")).toEqual({ stock: 3, reserved: 0, inStock: true });
  });

  it("no toca reservas que aún no vencen; reservedUntil == ahora ya vence", async () => {
    const env = setup({}, THIRTY - 1000);
    expect((await releaseExpiredReservations(env.deps)).scanned).toBe(0);
    env.clock.advance(1000); // ahora == reservedUntil
    expect((await releaseExpiredReservations(env.deps)).expired).toBe(1);
  });

  it("no libera pedidos pagados, en revisión, cancelados, expirados ni reembolsados", async () => {
    for (const paymentStatus of ["paid", "payment_review", "cancelled", "expired", "refunded"]) {
      const stockState = paymentStatus === "paid" || paymentStatus === "refunded" ? "committed" : paymentStatus === "payment_review" ? "reserved" : "released";
      const env = setup({ paymentStatus, stockState });
      const before = env.db.peek("products/1001");
      const summary = await releaseExpiredReservations(env.deps);
      expect(summary.expired, paymentStatus).toBe(0);
      expect(o(env)["paymentStatus"]).toBe(paymentStatus);
      expect(env.db.peek("products/1001")).toEqual(before);
    }
  });

  it("un pago que llega entre la lectura y la transacción no se pisa (se relee dentro)", async () => {
    const env = setup();
    const deps: ReleaseDeps = {
      ...env.deps,
      checkFlowPaid: async () => {
        // Entre la pre-lectura y la transacción, el pedido se paga.
        env.db.seed("orders/NE-000001", orderDoc({ paymentStatus: "paid", stockState: "committed", fulfillmentStatus: "preparing", paidAt: env.clock(), flow: flowState() }));
        return "not_paid";
      },
    };
    // El pedido debe ser de Flow con token para que se invoque checkFlowPaid.
    env.db.seed("orders/NE-000001", orderDoc({ flow: flowState() }));
    const summary = await releaseExpiredReservations(deps);
    expect(summary.expired).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(o(env)["paymentStatus"]).toBe("paid");
    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 2, inStock: true });
  });

  it("transferencia: vence a las 48 h, no a los 30 minutos", async () => {
    const env = setup({ paymentMethod: "transfer", reservedUntil: new Date(T0.getTime() + 2880 * 60_000) }, THIRTY + 1000);
    expect((await releaseExpiredReservations(env.deps)).scanned).toBe(0);
    env.clock.advance(2880 * 60_000);
    expect((await releaseExpiredReservations(env.deps)).expired).toBe(1);
  });

  it("si el stockState ya no es reserved, expira sin reponer nada", async () => {
    const env = setup({ stockState: "released" });
    const summary = await releaseExpiredReservations(env.deps);
    expect(summary.expired).toBe(1);
    expect(productStock(env.db, "1001").stock).toBe(3);
    expect(o(env)).toMatchObject({ paymentStatus: "expired", stockState: "released" });
  });

  it("un fallo en un pedido no impide procesar los demás", async () => {
    const env = setup();
    env.db.seed("orders/NE-000002", orderDoc({ orderNumber: "NE-000002", number: 2, reservedUntil: new Date(T0.getTime() + THIRTY + 1) }));
    env.db.seed("orders/NE-000003", { orderNumber: "NE-000003", paymentStatus: "pending_payment", reservedUntil: new Date(T0.getTime()) }); // documento corrupto
    const summary = await releaseExpiredReservations(env.deps);
    expect(summary).toMatchObject({ scanned: 3, expired: 2, failed: 1 });
    expect(o(env, "NE-000001")["paymentStatus"]).toBe("expired");
    expect(o(env, "NE-000002")["paymentStatus"]).toBe("expired");
  });

  it(`procesa como máximo ${RELEASE_BATCH_LIMIT} por ejecución y el resto en la siguiente`, async () => {
    const env = makeEnv();
    for (let i = 1; i <= 120; i++) {
      const n = `NE-${String(i).padStart(6, "0")}`;
      env.db.seed(`orders/${n}`, orderDoc({ orderNumber: n, number: i, stockState: "released", reservedUntil: new Date(T0.getTime() + i) }));
    }
    env.clock.advance(THIRTY + 1000);
    expect((await releaseExpiredReservations(env.deps)).scanned).toBe(RELEASE_BATCH_LIMIT);
    expect((await releaseExpiredReservations(env.deps)).scanned).toBe(20);
    expect((await releaseExpiredReservations(env.deps)).scanned).toBe(0);
  });
});

describe("releaseExpiredReservations con Flow (8: con un flow.token ya pagado aplica el pago)", () => {
  function withFlow(orderOverrides: DocData = {}) {
    const env = setup({ flow: flowState(), ...orderOverrides });
    const flow = new FakeFlow();
    const deps: ReleaseDeps = { ...env.deps, checkFlowPaid: makeCheckFlowPaid(env.deps, () => flow) };
    return { env, flow, deps };
  }

  it("Flow dice pagado -> se aplica el pago (paid) y NO se expira", async () => {
    const { env, flow, deps } = withFlow();
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 2 });
    const summary = await releaseExpiredReservations(deps);
    expect(summary).toMatchObject({ scanned: 1, paidInstead: 1, expired: 0 });
    expect(o(env)).toMatchObject({ paymentStatus: "paid", stockState: "committed", fulfillmentStatus: "preparing" });
    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 0, inStock: true });
    expect(env.db.peek("metrics/daily/days/2026-10-20")).toMatchObject({ ordersCount: 1 });
  });

  it("Flow dice pendiente, rechazado o anulado -> se expira normal", async () => {
    for (const status of [1, 3, 4]) {
      const { env, flow, deps } = withFlow();
      flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status });
      const summary = await releaseExpiredReservations(deps);
      expect(summary.expired, `status ${status}`).toBe(1);
      expect(o(env)["paymentStatus"]).toBe("expired");
    }
  });

  it("Flow rechaza la consulta (400/401: token desconocido o credenciales malas) -> se trata como error: espera la gracia y luego expira", async () => {
    // No se puede distinguir "no existe" de "mis credenciales no sirven": por prudencia no se expira de inmediato.
    const { env, deps } = withFlow();
    expect(await releaseExpiredReservations(deps)).toMatchObject({ skipped: 1, expired: 0 });
    env.clock.advance(FLOW_CHECK_GRACE_MS);
    expect((await releaseExpiredReservations(deps)).expired).toBe(1);
    expect(o(env)["paymentStatus"]).toBe("expired");
  });

  it("Flow caído: se espera (no se expira un pedido que podría estar pagado) hasta el plazo de gracia", async () => {
    const { env, flow, deps } = withFlow();
    flow.failWith = new FlowApiError("unavailable", 503);
    const first = await releaseExpiredReservations(deps);
    expect(first).toMatchObject({ skipped: 1, expired: 0 });
    expect(o(env)["paymentStatus"]).toBe("pending_payment");
    expect(productStock(env.db, "1001").reserved).toBe(2);

    env.clock.advance(FLOW_CHECK_GRACE_MS); // pasada la gracia se expira igual (un pago tardío se recupera como en flowConfirm)
    const later = await releaseExpiredReservations(deps);
    expect(later.expired).toBe(1);
  });

  it("sin cliente de Flow configurado: se trata como error y respeta la gracia", async () => {
    const env = setup({ flow: flowState() });
    const deps: ReleaseDeps = { ...env.deps, checkFlowPaid: makeCheckFlowPaid(env.deps, () => undefined) };
    expect((await releaseExpiredReservations(deps)).skipped).toBe(1);
  });

  it("pedido de transferencia o de Flow sin token no consulta a Flow", async () => {
    const env = setup({ paymentMethod: "transfer", reservedUntil: new Date(T0.getTime() + 1) });
    const flow = new FakeFlow();
    const deps: ReleaseDeps = { ...env.deps, checkFlowPaid: makeCheckFlowPaid(env.deps, () => flow) };
    await releaseExpiredReservations(deps);
    const noToken = setup({});
    const flow2 = new FakeFlow();
    await releaseExpiredReservations({ ...noToken.deps, checkFlowPaid: makeCheckFlowPaid(noToken.deps, () => flow2) });
    expect(flow.statusCalls).toEqual([]);
    expect(flow2.statusCalls).toEqual([]);
  });
});

describe("releaseExpiredReservations: corte tras errores seguidos de Flow (M2)", () => {
  function manyFlowOrders(n: number): TestEnv {
    const env = makeEnv();
    for (let i = 1; i <= n; i++) {
      const num = `NE-${String(i).padStart(6, "0")}`;
      env.db.seed(`orders/${num}`, orderDoc({ orderNumber: num, number: i, stockState: "released", flow: flowState({ token: `T${i}`, commerceOrder: num }), reservedUntil: new Date(T0.getTime() + i) }));
    }
    env.clock.advance(THIRTY + 1000);
    return env;
  }

  it(`tras ${MAX_CONSECUTIVE_FLOW_ERRORS} errores seguidos de Flow corta el ciclo sin consultar el resto`, async () => {
    const env = manyFlowOrders(10);
    const calls: string[] = [];
    const deps: ReleaseDeps = {
      ...env.deps,
      checkFlowPaid: async (order) => {
        calls.push(order.orderNumber);
        return "error";
      },
    };
    const summary = await releaseExpiredReservations(deps);
    expect(calls).toHaveLength(MAX_CONSECUTIVE_FLOW_ERRORS);
    expect(summary).toMatchObject({ scanned: 10, skipped: 3, expired: 0, abortedByFlow: { remaining: 7 } });
    expect(o(env, "NE-000010")["paymentStatus"]).toBe("pending_payment");

    // Con Flow de vuelta, la siguiente ejecución procesa todo.
    const next = await releaseExpiredReservations({ ...env.deps, checkFlowPaid: async () => "not_paid" });
    expect(next.expired).toBe(10);
    expect(next.abortedByFlow).toBeUndefined();
  });

  it("un éxito intermedio reinicia la cuenta: errores no seguidos no cortan el ciclo", async () => {
    const env = manyFlowOrders(6);
    const answers: FlowCheckResult[] = ["error", "error", "not_paid", "error", "error", "not_paid"];
    let i = 0;
    const summary = await releaseExpiredReservations({ ...env.deps, checkFlowPaid: async () => answers[i++] ?? "not_paid" });
    expect(i).toBe(6);
    expect(summary.abortedByFlow).toBeUndefined();
    expect(summary).toMatchObject({ scanned: 6, skipped: 4, expired: 2 });
  });
});
