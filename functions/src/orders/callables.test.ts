import { describe, expect, it } from "vitest";
import "../common/options.js";
import * as payments from "../payments/index.js";
import * as orders from "./index.js";

// Comprueba la configuración declarada de cada función (región, tiempos, secretos, App Check, cron)
// leyendo los metadatos que el SDK genera para el despliegue (`__endpoint`). No ejecuta nada en la nube.

interface Endpoint {
  region?: string[];
  timeoutSeconds?: number;
  maxInstances?: number;
  availableMemoryMb?: number;
  secretEnvironmentVariables?: { key: string }[];
  callableTrigger?: Record<string, unknown>;
  httpsTrigger?: { invoker?: string[] };
  scheduleTrigger?: { schedule?: string; timeZone?: string; retryConfig?: { retryCount?: number } };
}
const endpointOf = (fn: unknown): Endpoint => (fn as { __endpoint: Endpoint }).__endpoint;

const ALL = { ...orders, ...payments } as Record<string, unknown>;

describe("funciones exportadas de orders/ y payments/", () => {
  it("exporta exactamente las 11 funciones del contrato (secciones 3, 4 y 5.10)", () => {
    expect(Object.keys(ALL).sort()).toEqual(
      [
        "cancelOrder",
        "createFlowPayment",
        "createOrder",
        "flowConfirm",
        "getFlowCredentialsStatus",
        "getOrderStatus",
        "recordManualRefund",
        "releaseExpiredReservations",
        "resolvePaymentReview",
        "setFlowCredentials",
        "updateFulfillment",
      ].sort(),
    );
  });

  it("todas están en us-east4 con timeout y maxInstances del contrato", () => {
    const expected: Record<string, { timeout: number; max: number }> = {
      createOrder: { timeout: 30, max: 10 },
      createFlowPayment: { timeout: 30, max: 10 },
      flowConfirm: { timeout: 30, max: 10 },
      getOrderStatus: { timeout: 20, max: 10 },
      resolvePaymentReview: { timeout: 30, max: 5 },
      cancelOrder: { timeout: 30, max: 5 },
      updateFulfillment: { timeout: 15, max: 5 },
      recordManualRefund: { timeout: 30, max: 5 },
      releaseExpiredReservations: { timeout: 120, max: 1 },
      getFlowCredentialsStatus: { timeout: 30, max: 2 },
      setFlowCredentials: { timeout: 30, max: 2 },
    };
    for (const [name, want] of Object.entries(expected)) {
      const ep = endpointOf(ALL[name]);
      expect(ep.region, name).toEqual(["us-east4"]);
      expect(ep.timeoutSeconds, name).toBe(want.timeout);
      expect(ep.maxInstances, name).toBe(want.max);
      expect(ep.availableMemoryMb, name).toBe(256);
    }
  });

  it("los secretos de Flow solo están en las funciones que hablan con Flow", () => {
    const withSecrets = Object.keys(ALL).filter((n) => (endpointOf(ALL[n]).secretEnvironmentVariables ?? []).length > 0);
    expect(withSecrets.sort()).toEqual(["createFlowPayment", "flowConfirm", "getOrderStatus", "releaseExpiredReservations"]);
    for (const n of withSecrets) {
      expect((endpointOf(ALL[n]).secretEnvironmentVariables ?? []).map((s) => s.key).sort(), n).toEqual(["FLOW_API_KEY", "FLOW_SECRET_KEY"]);
    }
  });

  it("flowConfirm es HTTP público; las demás (salvo el cron) son callables", () => {
    expect(endpointOf(ALL["flowConfirm"]).httpsTrigger?.invoker).toEqual(["public"]);
    for (const n of Object.keys(ALL).filter((k) => !["flowConfirm", "releaseExpiredReservations"].includes(k))) {
      expect(endpointOf(ALL[n]).callableTrigger, n).toBeDefined();
    }
  });

  it("releaseExpiredReservations: cada 5 minutos, America/Santiago, sin reintentos", () => {
    const ep = endpointOf(ALL["releaseExpiredReservations"]);
    expect(ep.scheduleTrigger?.schedule).toBe("every 5 minutes");
    expect(ep.scheduleTrigger?.timeZone).toBe("America/Santiago");
    expect(ep.scheduleTrigger?.retryConfig?.retryCount ?? 0).toBe(0);
  });
});

describe("autorización de los callables de admin (test 13)", () => {
  const ADMIN_FUNCTIONS = ["resolvePaymentReview", "cancelOrder", "updateFulfillment", "recordManualRefund"] as const;
  type Runnable = { run: (request: unknown) => Promise<unknown> };
  const call = (name: string, auth: unknown, data: unknown = {}) =>
    (ALL[name] as Runnable).run({ data, auth, rawRequest: { headers: {}, ip: "203.0.113.5" } });
  const detailsOf = async (p: Promise<unknown>): Promise<{ code: string; app?: string }> => {
    try {
      await p;
    } catch (err) {
      const e = err as { code: string; details?: { code?: string } };
      return { code: e.code, ...(e.details?.code ? { app: e.details.code } : {}) };
    }
    return { code: "ok" };
  };

  it.each(ADMIN_FUNCTIONS)("%s: (a) sin sesión -> UNAUTHENTICATED", async (name) => {
    expect(await detailsOf(call(name, undefined))).toEqual({ code: "unauthenticated", app: "UNAUTHENTICATED" });
  });

  it.each(ADMIN_FUNCTIONS)("%s: (b) sesión sin claim admin -> NOT_ADMIN", async (name) => {
    expect(await detailsOf(call(name, { uid: "u1", token: {} }))).toEqual({ code: "permission-denied", app: "NOT_ADMIN" });
    expect(await detailsOf(call(name, { uid: "u1", token: { admin: "true" } }))).toEqual({ code: "permission-denied", app: "NOT_ADMIN" });
  });

  it.each(ADMIN_FUNCTIONS)("%s: (c) admin pasa la autorización (y falla después por entrada vacía)", async (name) => {
    expect(await detailsOf(call(name, { uid: "u1", token: { admin: true } }))).toEqual({ code: "invalid-argument", app: "INVALID_INPUT" });
  });
});

describe("autorización de las credenciales de Flow (D-035)", () => {
  const CREDENTIAL_FUNCTIONS = ["getFlowCredentialsStatus", "setFlowCredentials"] as const;
  type Runnable = { run: (request: unknown) => Promise<unknown> };
  const call = (name: string, auth: unknown, data: unknown = { apiKey: "1F90971E-8276-4715" }) =>
    (ALL[name] as Runnable).run({ data, auth, rawRequest: { headers: {}, ip: "203.0.113.5" } });
  const appCodeOf = async (p: Promise<unknown>): Promise<string | undefined> => {
    try {
      await p;
    } catch (err) {
      return (err as { details?: { code?: string } }).details?.code;
    }
    return undefined;
  };

  it.each(CREDENTIAL_FUNCTIONS)("%s: sin sesión o sin claim admin se rechaza antes de tocar Secret Manager", async (name) => {
    expect(await appCodeOf(call(name, undefined))).toBe("UNAUTHENTICATED");
    expect(await appCodeOf(call(name, { uid: "u1", token: {} }))).toBe("NOT_ADMIN");
    expect(await appCodeOf(call(name, { uid: "u1", token: { admin: "true" } }))).toBe("NOT_ADMIN");
  });

  it.each(CREDENTIAL_FUNCTIONS)("%s: un admin sin proyecto en la nube recibe FLOW_SECRETS_LOCAL", async (name) => {
    expect(await appCodeOf(call(name, { uid: "u1", token: { admin: true } }))).toBe("FLOW_SECRETS_LOCAL");
  });

  it.each(CREDENTIAL_FUNCTIONS)("%s: no lleva secretos enlazados", (name) => {
    expect(endpointOf(ALL[name]).secretEnvironmentVariables ?? []).toEqual([]);
  });
});
