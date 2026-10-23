import { describe, expect, it, vi } from "vitest";
import type { FlowEnvInput } from "./config.js";
import { makeApiClientProvider } from "./runtime.js";

// M4 (QA): el cliente de la API de Flow solo necesita ambiente, base y claves, y un fallo de
// configuración no se recuerda para siempre. D-035: unas claves nuevas se aplican sin reiniciar.

vi.mock("firebase-functions/logger", () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }));

const API_ONLY: FlowEnvInput = {
  APP_ENV: "staging",
  FLOW_API_BASE: "https://sandbox.flow.cl/api",
  FLOW_API_KEY: "clave-de-prueba",
  FLOW_SECRET_KEY: "secreto-de-prueba",
};

describe("makeApiClientProvider (M4)", () => {
  it("funciona sin FLOW_CONFIRMATION_URL ni SITE_URL", async () => {
    expect(await makeApiClientProvider(() => API_ONLY)()).toBeDefined();
  });

  it("un fallo de configuración no se cachea: al corregirse, la misma instancia se recupera", async () => {
    let env: FlowEnvInput = { ...API_ONLY, FLOW_SECRET_KEY: undefined };
    const provider = makeApiClientProvider(() => env);
    expect(await provider()).toBeUndefined();
    expect(await provider()).toBeUndefined();
    env = API_ONLY;
    expect(await provider()).toBeDefined();
  });

  it("reutiliza el cliente mientras las claves no cambien", async () => {
    const provider = makeApiClientProvider(async () => API_ONLY);
    const first = await provider();
    expect(await provider()).toBe(first);
  });

  it("D-035: con claves nuevas crea otro cliente sin reiniciar la instancia", async () => {
    let env: FlowEnvInput = API_ONLY;
    const provider = makeApiClientProvider(() => env);
    const first = await provider();
    env = { ...API_ONLY, FLOW_SECRET_KEY: "secreto-nuevo" };
    const second = await provider();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });

  it("la guarda de ambiente sigue vigente: staging con la API de producción se rechaza", async () => {
    expect(await makeApiClientProvider(() => ({ ...API_ONLY, FLOW_API_BASE: "https://www.flow.cl/api" }))()).toBeUndefined();
  });
});
