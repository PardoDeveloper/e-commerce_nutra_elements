import { describe, expect, it } from "vitest";
import { buildReturnUrl, FlowConfigError, resolveFlowConfig, type FlowEnvInput } from "./config.js";
import { FLOW_PRODUCTION_BASE, FLOW_SANDBOX_BASE } from "./flow-client.js";

const base = (over: FlowEnvInput = {}): FlowEnvInput => ({
  APP_ENV: "staging",
  FLOW_API_BASE: FLOW_SANDBOX_BASE,
  FLOW_CONFIRMATION_URL: "https://flowconfirm-abc-uk.a.run.app",
  SITE_URL: "https://nutra-staging.web.app/",
  FLOW_API_KEY: "k",
  FLOW_SECRET_KEY: "s",
  ...over,
});

function problems(env: FlowEnvInput, scope: "api" | "full" = "full"): string[] {
  try {
    resolveFlowConfig(env, scope);
  } catch (err) {
    if (err instanceof FlowConfigError) return err.problems;
    throw err;
  }
  return [];
}

describe("resolveFlowConfig", () => {
  it("staging con sandbox es válido; normaliza barras finales", () => {
    const c = resolveFlowConfig(base({ FLOW_API_BASE: `${FLOW_SANDBOX_BASE}/` }));
    expect(c).toMatchObject({ appEnv: "staging", apiBase: FLOW_SANDBOX_BASE, siteUrl: "https://nutra-staging.web.app" });
  });

  it("guarda anti-cobro real: staging y local solo aceptan el sandbox", () => {
    for (const appEnv of ["staging", "local"]) {
      expect(problems(base({ APP_ENV: appEnv, FLOW_API_BASE: FLOW_PRODUCTION_BASE, ...(appEnv === "local" ? { SITE_URL: "http://localhost:3000" } : {}) }))).toEqual([`FLOW_API_BASE no corresponde a APP_ENV=${appEnv}`]);
    }
  });

  it("production solo acepta la API real", () => {
    expect(problems(base({ APP_ENV: "production" }))).toEqual(["FLOW_API_BASE no corresponde a APP_ENV=production"]);
    expect(problems(base({ APP_ENV: "production", FLOW_API_BASE: FLOW_PRODUCTION_BASE }))).toEqual([]);
  });

  it("APP_ENV ausente o desconocido es inválido (falla cerrado)", () => {
    expect(problems(base({ APP_ENV: undefined }))).toContain("APP_ENV debe ser local, staging o production");
    expect(problems(base({ APP_ENV: "dev" }))).toContain("APP_ENV debe ser local, staging o production");
  });

  it("exige base y claves; los mensajes nombran variables, nunca valores", () => {
    const p = problems({ APP_ENV: "staging" });
    expect(p).toEqual(expect.arrayContaining(["FLOW_API_BASE falta", "FLOW_API_KEY falta", "FLOW_SECRET_KEY falta"]));
    const withSecrets = problems(base({ FLOW_API_KEY: "valor-secreto-123", FLOW_API_BASE: "https://otro.example.com" })).join(" ");
    expect(withSecrets).not.toContain("valor-secreto-123");
    expect(withSecrets).not.toContain("otro.example.com");
  });

  it("local permite http en SITE_URL y en la confirmación; staging exige https", () => {
    const local = base({ APP_ENV: "local", SITE_URL: "http://localhost:3000", FLOW_CONFIRMATION_URL: "http://127.0.0.1:5001/x" });
    expect(problems(local)).toEqual([]);
    expect(problems(base({ SITE_URL: "http://localhost:3000" }))).toEqual(["SITE_URL debe ser https"]);
    expect(problems(base({ FLOW_CONFIRMATION_URL: "http://x.example.com" }))).toEqual(["FLOW_CONFIRMATION_URL debe ser https"]);
  });

  it("scope api no exige las URLs", () => {
    expect(problems(base({ SITE_URL: undefined, FLOW_CONFIRMATION_URL: undefined }), "api")).toEqual([]);
    expect(problems(base({ SITE_URL: undefined, FLOW_CONFIRMATION_URL: undefined }), "full")).toHaveLength(2);
  });
});

describe("buildReturnUrl", () => {
  it("A2: solo lleva el número de pedido, nunca el token de acceso", () => {
    expect(buildReturnUrl("https://nutra.cl", "NE-000123")).toBe("https://nutra.cl/checkout/retorno?o=NE-000123");
    expect(buildReturnUrl("https://nutra.cl", "NE&1")).toBe("https://nutra.cl/checkout/retorno?o=NE%261");
  });
});
