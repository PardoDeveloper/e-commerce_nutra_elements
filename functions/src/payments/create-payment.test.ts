import { describe, expect, it } from "vitest";
import type { DocData } from "../common/db.js";
import { getAppErrorCode } from "../common/errors.js";
import { hashAccessToken } from "../orders/primitives.js";
import { flowState, makeEnv, orderDoc, T0, type TestEnv } from "../orders/testing/fixtures.js";
import { resolveFlowConfig, type FlowConfig } from "./config.js";
import { handleCreateFlowPayment, MIN_FLOW_TIMEOUT_SECONDS, type CreatePaymentDeps } from "./create-payment.js";
import { FlowApiError } from "./flow-client.js";
import { FakeFlow } from "./testing/fake-flow.js";

const TOKEN = "token-de-acceso-de-prueba-0123456789";
const config: FlowConfig = resolveFlowConfig({
  APP_ENV: "staging",
  FLOW_API_BASE: "https://sandbox.flow.cl/api",
  FLOW_CONFIRMATION_URL: "https://flowconfirm-test.a.run.app",
  SITE_URL: "https://nutra-staging.web.app",
  FLOW_API_KEY: "k",
  FLOW_SECRET_KEY: "s",
});

function setup(orderOverrides: DocData = {}): { env: TestEnv; flow: FakeFlow; deps: CreatePaymentDeps } {
  const env = makeEnv({ "orders/NE-000001": orderDoc({ accessTokenHash: hashAccessToken(TOKEN), ...orderOverrides }) });
  const flow = new FakeFlow();
  return { env, flow, deps: { ...env.deps, getFlow: () => flow, getConfig: () => config } };
}

const request = (over: Record<string, unknown> = {}) => ({ orderNumber: "NE-000001", accessToken: TOKEN, ...over });
const orderOf = (env: TestEnv) => env.db.peek("orders/NE-000001") as DocData;

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (err) {
    return getAppErrorCode(err) ?? `otro:${String(err)}`;
  }
  return undefined;
}

describe("createFlowPayment (3.2)", () => {
  it("crea la orden en Flow con el monto del pedido y guarda order.flow", async () => {
    const { env, flow, deps } = setup();
    const res = await handleCreateFlowPayment(deps, request());

    expect(res.redirectUrl).toBe("https://sandbox.flow.cl/app/web/pay.php?token=FLOWTOKEN1");
    expect(res.reservedUntil).toBe(new Date(T0.getTime() + 30 * 60_000).toISOString());
    expect(flow.created).toHaveLength(1);
    expect(flow.created[0]).toMatchObject({
      commerceOrder: "NE-000001",
      subject: "Pedido NE-000001 - Nutra Elements",
      currency: "CLP",
      amount: 32762, // sale de order.total
      email: "ana@example.com",
      urlConfirmation: "https://flowconfirm-test.a.run.app/",
      urlReturn: `https://nutra-staging.web.app/checkout/retorno?o=NE-000001&t=${TOKEN}`,
      timeoutSeconds: 1800,
    });
    expect(orderOf(env)["flow"]).toMatchObject({
      commerceOrder: "NE-000001",
      token: "FLOWTOKEN1",
      flowOrder: 5001,
      paymentUrl: "https://sandbox.flow.cl/app/web/pay.php?token=FLOWTOKEN1",
      attempt: 1,
      lastStatus: null,
    });
    // Solo toca flow y updatedAt: ni stock ni estado de pago.
    expect(orderOf(env)).toMatchObject({ paymentStatus: "pending_payment", stockState: "reserved" });
  });

  it("el cliente no puede mandar el monto ni las URLs (campos extra -> INVALID_INPUT)", async () => {
    const { flow, deps } = setup();
    for (const extra of [{ amount: 1 }, { total: 1 }, { urlReturn: "https://evil.example" }, { urlConfirmation: "https://evil.example" }]) {
      expect(await codeOf(handleCreateFlowPayment(deps, request(extra)))).toBe("INVALID_INPUT");
    }
    expect(flow.created).toHaveLength(0);
  });

  it("número inexistente y token incorrecto dan el MISMO error ORDER_NOT_FOUND", async () => {
    const { flow, deps } = setup();
    expect(await codeOf(handleCreateFlowPayment(deps, request({ orderNumber: "NE-000999" })))).toBe("ORDER_NOT_FOUND");
    expect(await codeOf(handleCreateFlowPayment(deps, request({ accessToken: "otro-token-incorrecto-0123456789" })))).toBe("ORDER_NOT_FOUND");
    expect(flow.created).toHaveLength(0);
  });

  it("transferencia, pagado, cancelado o en revisión -> ORDER_NOT_PAYABLE", async () => {
    for (const over of [{ paymentMethod: "transfer" }, { paymentStatus: "paid" }, { paymentStatus: "cancelled" }, { paymentStatus: "payment_review" }, { paymentStatus: "refunded" }]) {
      const { flow, deps } = setup(over);
      expect(await codeOf(handleCreateFlowPayment(deps, request())), JSON.stringify(over)).toBe("ORDER_NOT_PAYABLE");
      expect(flow.created).toHaveLength(0);
    }
  });

  it("reserva vencida -> ORDER_EXPIRED", async () => {
    const { env, flow, deps } = setup();
    env.clock.advance(31 * 60_000);
    expect(await codeOf(handleCreateFlowPayment(deps, request()))).toBe("ORDER_EXPIRED");
    expect(flow.created).toHaveLength(0);
  });

  it("idempotencia: segunda llamada con intento pendiente devuelve la misma URL sin crear otra orden", async () => {
    const { flow, deps } = setup();
    const first = await handleCreateFlowPayment(deps, request());
    // El intento se conoce como pendiente.
    flow.setStatus("FLOWTOKEN1", { commerceOrder: "NE-000001", status: 1 });
    const second = await handleCreateFlowPayment(deps, request());
    expect(second.redirectUrl).toBe(first.redirectUrl);
    expect(flow.created).toHaveLength(1);
  });

  it("con lastStatus=1 guardado reutiliza sin consultar a Flow", async () => {
    const { flow, deps } = setup({ flow: flowState({ token: "T1", lastStatus: 1 }) });
    const res = await handleCreateFlowPayment(deps, request());
    expect(res.redirectUrl).toBe("https://sandbox.flow.cl/app/web/pay.php?token=TOKEN1");
    expect(flow.statusCalls).toEqual([]);
    expect(flow.created).toHaveLength(0);
  });

  it("intento rechazado o anulado -> intento nuevo con commerceOrder NE-000001-2", async () => {
    for (const lastStatus of [3, 4]) {
      const { env, flow, deps } = setup({ flow: flowState({ lastStatus }) });
      const res = await handleCreateFlowPayment(deps, request());
      expect(flow.created[0]?.commerceOrder).toBe("NE-000001-2");
      expect(res.redirectUrl).toContain("FLOWTOKEN1");
      expect(orderOf(env)["flow"]).toMatchObject({ attempt: 2, commerceOrder: "NE-000001-2", token: "FLOWTOKEN1" });
    }
  });

  it("estado desconocido: consulta getStatus; si Flow ya lo rechazó crea intento nuevo", async () => {
    const { flow, deps } = setup({ flow: flowState() });
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 3 });
    await handleCreateFlowPayment(deps, request());
    expect(flow.statusCalls).toEqual(["TOKEN1"]);
    expect(flow.created[0]?.commerceOrder).toBe("NE-000001-2");
  });

  it("estado desconocido y Flow ya lo cobró: aplica el pago y responde ORDER_NOT_PAYABLE (no cobra dos veces)", async () => {
    const { env, flow, deps } = setup({ flow: flowState() });
    env.db.seed("products/1001", { sku: "1001", stock: 3, reserved: 2, name: "x", price: 1, published: true, active: true });
    env.db.seed("products/1002", { sku: "1002", stock: 2, reserved: 1, name: "y", price: 1, published: true, active: true });
    flow.setStatus("TOKEN1", { commerceOrder: "NE-000001", status: 2 });
    expect(await codeOf(handleCreateFlowPayment(deps, request()))).toBe("ORDER_NOT_PAYABLE");
    expect(orderOf(env)["paymentStatus"]).toBe("paid");
    expect(flow.created).toHaveLength(0);
  });

  it("estado desconocido y getStatus falla: se reutiliza la URL guardada", async () => {
    const { flow, deps } = setup({ flow: flowState() });
    flow.failWith = new FlowApiError("unavailable", 503);
    const res = await handleCreateFlowPayment(deps, request());
    expect(res.redirectUrl).toContain("token=TOKEN1");
  });

  it("Flow caído o rechaza -> FLOW_UNAVAILABLE y el pedido sigue pendiente y sin flow", async () => {
    for (const err of [new FlowApiError("unavailable", 503), new FlowApiError("client", 400, 105)]) {
      const { env, flow, deps } = setup();
      flow.failCreateWith = err;
      expect(await codeOf(handleCreateFlowPayment(deps, request()))).toBe("FLOW_UNAVAILABLE");
      expect(orderOf(env)).toMatchObject({ paymentStatus: "pending_payment", flow: null });
    }
  });

  it("configuración de Flow inválida -> FLOW_UNAVAILABLE sin llamar a Flow", async () => {
    const { flow, deps } = setup();
    const bad: CreatePaymentDeps = { ...deps, getConfig: () => { throw new Error("config"); } };
    expect(await codeOf(handleCreateFlowPayment(bad, request()))).toBe("FLOW_UNAVAILABLE");
    expect(flow.created).toHaveLength(0);
  });

  it("el timeout hacia Flow acompaña la reserva restante, con un mínimo", async () => {
    const { env, flow, deps } = setup();
    env.clock.advance(20 * 60_000);
    await handleCreateFlowPayment(deps, request());
    expect(flow.created[0]?.timeoutSeconds).toBe(600);

    const near = setup();
    near.env.clock.advance(30 * 60_000 - 5_000);
    await handleCreateFlowPayment(near.deps, request());
    expect(near.flow.created[0]?.timeoutSeconds).toBe(MIN_FLOW_TIMEOUT_SECONDS);
  });

  it("llamadas simultáneas: gana la primera y todas reciben la misma URL guardada", async () => {
    const { env, flow, deps } = setup();
    const results = await Promise.all(Array.from({ length: 4 }, () => handleCreateFlowPayment(deps, request())));
    const urls = new Set(results.map((r) => r.redirectUrl));
    expect(urls.size).toBe(1);
    const stored = (orderOf(env)["flow"] as DocData)["paymentUrl"];
    expect(urls.has(stored as string)).toBe(true);
    expect(flow.created.length).toBeGreaterThanOrEqual(1); // las órdenes sobrantes en Flow quedan sin pagar y expiran por timeout
  });
});
