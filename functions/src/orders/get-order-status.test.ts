import { describe, expect, it, vi } from "vitest";
import type { DocData } from "../common/db.js";
import { getAppErrorCode } from "../common/errors.js";
import { FlowApiError } from "../payments/flow-client.js";
import { makeReconcile } from "../payments/runtime.js";
import { FakeFlow } from "../payments/testing/fake-flow.js";
import { handleGetOrderStatus, needsReconcile, RECONCILE_INTERVAL_MS, type GetStatusDeps } from "./get-order-status.js";
import { hashAccessToken, rateLimitKey } from "./primitives.js";
import { DEFAULT_LIMITS, parsePrivateSettings } from "./settings.js";
import { flowState, makeEnv, orderDoc, productDoc, SETTINGS_PRIVATE, T0, VALID_RUT, type TestEnv } from "./testing/fixtures.js";
import { order } from "./testing/fixtures.js";

vi.mock("firebase-functions/logger", () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }));

const TOKEN = "token-de-acceso-de-prueba-0123456789";
const IP = "203.0.113.5";

function setup(orderOverrides: DocData = {}, limits: Partial<Record<string, number>> = {}): TestEnv {
  return makeEnv({
    "orders/NE-000001": orderDoc({ accessTokenHash: hashAccessToken(TOKEN), ...orderOverrides }),
    "products/1001": productDoc("1001", { stock: 3, reserved: 2 }),
    "products/1002": productDoc("1002", { stock: 2, reserved: 1 }),
    "settings/private": { ...SETTINGS_PRIVATE, limits: { ...(SETTINGS_PRIVATE["limits"] as object), ...limits } },
  });
}
/** `ip: null` = la petición no trae IP. */
const ask = (env: TestEnv, data: unknown = { orderNumber: "NE-000001", accessToken: TOKEN }, ip: string | null = IP, extra: Partial<GetStatusDeps> = {}) =>
  handleGetOrderStatus({ ...env.deps, ...extra }, data, { ip: ip ?? undefined });

async function errOf(p: Promise<unknown>): Promise<{ code?: string | undefined; message?: string | undefined }> {
  try {
    await p;
  } catch (err) {
    return { code: getAppErrorCode(err), message: (err as Error).message };
  }
  return {};
}

describe("getOrderStatus (3.4, test 10)", () => {
  it("con número y token correctos devuelve la vista pública", async () => {
    const env = setup();
    const res = await ask(env);
    expect(res).toMatchObject({ orderNumber: "NE-000001", paymentStatus: "pending_payment", total: 32762, delivery: { type: "shipping", communeName: "Puente Alto" } });
  });

  it("token incorrecto y número inexistente dan la MISMA respuesta (código y mensaje)", async () => {
    const env = setup();
    const wrongToken = await errOf(ask(env, { orderNumber: "NE-000001", accessToken: "otro-token-incorrecto-0123456789" }));
    const missing = await errOf(ask(env, { orderNumber: "NE-000555", accessToken: TOKEN }));
    expect(wrongToken).toEqual({ code: "ORDER_NOT_FOUND", message: "No encontramos el pedido." });
    expect(missing).toEqual(wrongToken);
  });

  it("la respuesta no contiene correo, teléfono, dirección, RUT ni datos de Flow/refund", async () => {
    const env = setup({ flow: flowState(), refund: null });
    const json = JSON.stringify(await ask(env));
    for (const forbidden of ["ana@example.com", "+56912345678", VALID_RUT, "Calle Falsa", "depto 4", "TOKEN1", "accessTokenHash", "hash-de", "statusHistory", "refund"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("exige número Y token con formato válido; campos extra -> INVALID_INPUT", async () => {
    const env = setup();
    for (const bad of [{}, { orderNumber: "NE-000001" }, { accessToken: TOKEN }, { orderNumber: "x", accessToken: TOKEN }, { orderNumber: "NE-000001", accessToken: "" }, { orderNumber: "NE-000001", accessToken: "a b c d e f g h i j" }, { orderNumber: "NE-000001", accessToken: TOKEN, extra: 1 }, null, "NE-000001"]) {
      expect((await errOf(ask(env, bad))).code).toBe("INVALID_INPUT");
    }
  });

  it("limite por IP: pasadas las consultas permitidas -> RATE_LIMITED; otra IP no se afecta; la ventana se renueva", async () => {
    const env = setup({}, { orderStatusPerIpPer10Min: 3 });
    for (let i = 0; i < 3; i++) await ask(env);
    expect((await errOf(ask(env))).code).toBe("RATE_LIMITED");
    await expect(ask(env, undefined, "198.51.100.8")).resolves.toBeDefined();
    env.clock.advance(10 * 60_000);
    await expect(ask(env)).resolves.toBeDefined();
  });

  it("límite por defecto (settings/private sin limits): 120 consultas por IP cada 10 minutos (D-032)", async () => {
    expect(DEFAULT_LIMITS.orderStatusPerIpPer10Min).toBe(120);
    expect(parsePrivateSettings(undefined).limits.orderStatusPerIpPer10Min).toBe(120);
    const env = setup();
    env.db.seed("settings/private", { ...SETTINGS_PRIVATE, limits: undefined });
    for (let i = 0; i < 120; i++) await ask(env);
    expect((await errOf(ask(env))).code).toBe("RATE_LIMITED");
  });

  it("fallos por número: pasado el máximo -> RATE_LIMITED; el token CORRECTO nunca se bloquea", async () => {
    const env = setup({}, { orderStatusFailuresPerOrder: 3, orderStatusPerIpPer10Min: 1000 });
    const wrong = { orderNumber: "NE-000001", accessToken: "otro-token-incorrecto-0123456789" };
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 5; i++) codes.push((await errOf(ask(env, wrong, `198.51.100.${i + 1}`))).code);
    expect(codes).toEqual(["ORDER_NOT_FOUND", "ORDER_NOT_FOUND", "ORDER_NOT_FOUND", "RATE_LIMITED", "RATE_LIMITED"]);
    await expect(ask(env)).resolves.toMatchObject({ orderNumber: "NE-000001" });
  });

  it("los fallos sobre un número inexistente también se limitan, sin delatar si existe", async () => {
    const env = setup({}, { orderStatusFailuresPerOrder: 2, orderStatusPerIpPer10Min: 1000 });
    const probe = { orderNumber: "NE-000321", accessToken: TOKEN };
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await errOf(ask(env, probe, `198.51.100.${i + 1}`))).code);
    expect(codes).toEqual(["ORDER_NOT_FOUND", "ORDER_NOT_FOUND", "RATE_LIMITED", "RATE_LIMITED"]);
  });

  it("las claves de límite no llevan la IP ni el número en claro", async () => {
    const env = setup({}, {});
    await ask(env);
    await errOf(ask(env, { orderNumber: "NE-000001", accessToken: "otro-token-incorrecto-0123456789" }));
    const keys = env.db.paths("rateLimits/");
    expect(keys).toContain(`rateLimits/${rateLimitKey("getOrderStatus", IP)}`);
    expect(keys).toContain(`rateLimits/${rateLimitKey("getOrderStatusFail", "NE-000001")}`);
    expect(keys.join("")).not.toContain("203.0.113");
  });

  it("sin IP no aplica el límite por IP", async () => {
    const env = setup({}, { orderStatusPerIpPer10Min: 1 });
    await ask(env, undefined, null);
    await ask(env, undefined, null);
    expect(env.db.paths("rateLimits/")).toEqual([]);
  });

  it("pedido antiguo por transferencia: no expone datos bancarios aunque queden en settings (D-044)", async () => {
    const env = setup({ paymentMethod: "transfer" });
    const res = await ask(env);
    expect(res).not.toHaveProperty("transferInstructions");
    expect(JSON.stringify(res)).not.toContain("BANCO DE PRUEBA");
  });
});

describe("getOrderStatus - reconciliación con Flow (3.4)", () => {
  function withFlow(orderOverrides: DocData = {}, limits: Partial<Record<string, number>> = {}) {
    const env = setup({ flow: flowState(), ...orderOverrides }, { orderStatusPerIpPer10Min: 1000, ...limits });
    const flow = new FakeFlow();
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 2 });
    const deps = { reconcile: makeReconcile(env.deps, () => flow) };
    return { env, flow, deps };
  }

  it("needsReconcile: solo Flow pendiente con token y última consulta de más de 15 s", () => {
    const now = new Date(T0.getTime() + 60_000);
    expect(needsReconcile(order({ flow: flowState() }), now)).toBe(true);
    expect(needsReconcile(order({ flow: flowState({ lastCheckedAt: new Date(now.getTime() - RECONCILE_INTERVAL_MS - 1) }) }), now)).toBe(true);
    expect(needsReconcile(order({ flow: flowState({ lastCheckedAt: new Date(now.getTime() - 5000) }) }), now)).toBe(false);
    expect(needsReconcile(order({ flow: null }), now)).toBe(false);
    expect(needsReconcile(order({ paymentMethod: "transfer", flow: flowState() }), now)).toBe(false);
    expect(needsReconcile(order({ paymentStatus: "paid", flow: flowState() }), now)).toBe(false);
  });

  it("Flow ya cobró y la confirmación no llegó: el pedido pasa a paid en la misma respuesta", async () => {
    const { env, flow, deps } = withFlow();
    const res = await ask(env, undefined, IP, deps);
    expect(res).toMatchObject({ paymentStatus: "paid", fulfillmentStatus: "preparing", reservedUntil: null });
    expect(flow.statusCalls).toEqual(["TOKEN1"]);
    expect(env.db.peek("metrics/daily/days/2026-10-20")).toMatchObject({ ordersCount: 1, revenue: 32762 });
  });

  it("la reconciliación es idempotente con flowConfirm: no cuenta dos veces", async () => {
    const { env, flow, deps } = withFlow();
    await ask(env, undefined, IP, deps);
    env.clock.advance(60_000);
    await ask(env, undefined, IP, deps);
    await Promise.all([ask(env, undefined, IP, deps), ask(env, undefined, IP, deps)]);
    expect(env.db.peek("metrics/daily/days/2026-10-20")).toMatchObject({ ordersCount: 1 });
    // Pagado: ya no se consulta más a Flow.
    expect(flow.statusCalls.length).toBeLessThanOrEqual(3);
  });

  it("no consulta a Flow más de una vez cada 15 segundos", async () => {
    const { env, flow, deps } = withFlow();
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 1 });
    await ask(env, undefined, IP, deps);
    env.clock.advance(5000);
    await ask(env, undefined, IP, deps);
    env.clock.advance(5000);
    await ask(env, undefined, IP, deps);
    expect(flow.statusCalls).toHaveLength(1);
    env.clock.advance(6000);
    await ask(env, undefined, IP, deps);
    expect(flow.statusCalls).toHaveLength(2);
  });

  it("si Flow falla, se devuelve el estado guardado sin error", async () => {
    const { env, flow, deps } = withFlow();
    flow.failWith = new FlowApiError("unavailable", 503);
    const res = await ask(env, undefined, IP, deps);
    expect(res.paymentStatus).toBe("pending_payment");
  });

  it("sin cliente de Flow configurado (reconcile no hace nada) funciona igual", async () => {
    const env = setup({ flow: flowState() });
    const res = await ask(env, undefined, IP, { reconcile: makeReconcile(env.deps, () => undefined) });
    expect(res.paymentStatus).toBe("pending_payment");
  });

  it("la reconciliación solo ocurre con token válido (con token malo nunca se llama a Flow)", async () => {
    const { env, flow, deps } = withFlow();
    await errOf(ask(env, { orderNumber: "NE-000001", accessToken: "otro-token-incorrecto-0123456789" }, IP, deps));
    expect(flow.statusCalls).toEqual([]);
  });
});
