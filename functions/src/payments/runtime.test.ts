import { describe, expect, it, vi } from "vitest";
import type { FlowEnvInput } from "./config.js";
import { makeApiClientProvider } from "./runtime.js";

// M4 (QA): el cliente de la API de Flow solo necesita ambiente, base y claves, y un fallo de
// configuración no se recuerda para siempre.

vi.mock("firebase-functions/logger", () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }));

const API_ONLY: FlowEnvInput = {
  APP_ENV: "staging",
  FLOW_API_BASE: "https://sandbox.flow.cl/api",
  FLOW_API_KEY: "clave-de-prueba",
  FLOW_SECRET_KEY: "secreto-de-prueba",
};

describe("makeApiClientProvider (M4)", () => {
  it("funciona sin FLOW_CONFIRMATION_URL ni SITE_URL", () => {
    expect(makeApiClientProvider(() => API_ONLY)()).toBeDefined();
  });

  it("un fallo de configuración no se cachea: al corregirse, la misma instancia se recupera", () => {
    let env: FlowEnvInput = { ...API_ONLY, FLOW_SECRET_KEY: undefined };
    const provider = makeApiClientProvider(() => env);
    expect(provider()).toBeUndefined();
    expect(provider()).toBeUndefined();
    env = API_ONLY;
    expect(provider()).toBeDefined();
  });

  it("el éxito sí se cachea (misma instancia y sin releer la configuración)", () => {
    const read = vi.fn(() => API_ONLY);
    const provider = makeApiClientProvider(read);
    const first = provider();
    expect(provider()).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("la guarda de ambiente sigue vigente: staging con la API de producción se rechaza", () => {
    expect(makeApiClientProvider(() => ({ ...API_ONLY, FLOW_API_BASE: "https://www.flow.cl/api" }))()).toBeUndefined();
  });
});
