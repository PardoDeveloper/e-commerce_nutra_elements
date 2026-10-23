import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, vi } from "vitest";
import { getAppErrorCode } from "../common/errors.js";
import {
  handleGetFlowCredentialsStatus,
  handleSetFlowCredentials,
  makeLatestSecretReader,
  SecretStoreError,
  type FlowSecretName,
  type SecretStore,
} from "./credentials.js";

// D-035: credenciales de Flow editables por el admin, guardadas solo en Secret Manager.

const logs = vi.hoisted(() => ({ info: [] as unknown[][] }));
vi.mock("firebase-functions/logger", () => ({
  debug: () => undefined,
  info: (...args: unknown[]) => void logs.info.push(args),
  warn: () => undefined,
  error: () => undefined,
}));

const API_KEY = "1F90971E-8276-4715-97FF-2BLG5030EE3B";
const SECRET_KEY = "f8b45f9b8bcdb5702dc86a1b894492303741c405";

function fakeStore(initial: Partial<Record<FlowSecretName, string>> = {}) {
  const versions = new Map<FlowSecretName, { value: string; at: string }[]>();
  for (const [name, value] of Object.entries(initial)) versions.set(name as FlowSecretName, [{ value: value!, at: "2026-10-01T00:00:00.000Z" }]);
  const store: SecretStore & { versions: typeof versions } = {
    versions,
    accessLatest: vi.fn(async (name: FlowSecretName) => versions.get(name)?.at(-1)?.value),
    latestCreatedAt: vi.fn(async (name: FlowSecretName) => versions.get(name)?.at(-1)?.at ?? null),
    addVersion: vi.fn(async (name: FlowSecretName, value: string) => {
      versions.set(name, [...(versions.get(name) ?? []), { value, at: "2026-10-23T12:00:00.000Z" }]);
    }),
  };
  return store;
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return getAppErrorCode(err);
  }
}

describe("handleSetFlowCredentials", () => {
  it("guarda ambas credenciales como versiones nuevas y devuelve el estado sin los valores", async () => {
    const store = fakeStore();
    const onSaved = vi.fn();
    const status = await handleSetFlowCredentials(store, { apiKey: ` ${API_KEY} `, secretKey: SECRET_KEY }, "admin-1", onSaved);
    expect(store.addVersion).toHaveBeenCalledWith("FLOW_API_KEY", API_KEY);
    expect(store.addVersion).toHaveBeenCalledWith("FLOW_SECRET_KEY", SECRET_KEY);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(status).toEqual({
      apiKey: { configured: true, updatedAt: "2026-10-23T12:00:00.000Z", hint: "EE3B" },
      secretKey: { configured: true, updatedAt: "2026-10-23T12:00:00.000Z" },
    });
    expect(JSON.stringify(status)).not.toContain(SECRET_KEY);
    expect(JSON.stringify(status)).not.toContain(API_KEY);
  });

  it("permite cambiar solo una credencial", async () => {
    const store = fakeStore({ FLOW_API_KEY: API_KEY, FLOW_SECRET_KEY: SECRET_KEY });
    await handleSetFlowCredentials(store, { secretKey: "nuevo-secreto-123" }, "admin-1");
    expect(store.addVersion).toHaveBeenCalledTimes(1);
    expect(store.versions.get("FLOW_SECRET_KEY")?.at(-1)?.value).toBe("nuevo-secreto-123");
  });

  it("el log de auditoría nombra al admin y los secretos, nunca los valores", async () => {
    logs.info.length = 0;
    await handleSetFlowCredentials(fakeStore(), { apiKey: API_KEY, secretKey: SECRET_KEY }, "admin-1");
    const logged = JSON.stringify(logs.info);
    expect(logged).toContain("admin-1");
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain(SECRET_KEY);
  });

  it.each([
    ["vacío", {}],
    ["muy corta", { apiKey: "abc" }],
    ["con espacios", { secretKey: "clave con espacios" }],
    ["campo extra", { apiKey: API_KEY, apiBase: "https://www.flow.cl/api" }],
    ["no es objeto", "x"],
  ])("rechaza la entrada %s sin escribir nada", async (_label, data) => {
    const store = fakeStore();
    expect(await codeOf(handleSetFlowCredentials(store, data, "admin-1"))).toBe("INVALID_INPUT");
    expect(store.addVersion).not.toHaveBeenCalled();
  });

  it("el error de validación no repite el valor recibido", async () => {
    try {
      await handleSetFlowCredentials(fakeStore(), { secretKey: "secreto filtrado" }, "admin-1");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect(JSON.stringify((err as HttpsError).details)).not.toContain("filtrado");
    }
  });

  it("traduce los errores de Secret Manager a códigos de aplicación", async () => {
    const missing = fakeStore();
    missing.addVersion = vi.fn(async () => {
      throw new SecretStoreError("not_found");
    });
    expect(await codeOf(handleSetFlowCredentials(missing, { apiKey: API_KEY }, "admin-1"))).toBe("FLOW_SECRET_MISSING");
    const forbidden = fakeStore();
    forbidden.addVersion = vi.fn(async () => {
      throw new SecretStoreError("permission_denied");
    });
    expect(await codeOf(handleSetFlowCredentials(forbidden, { apiKey: API_KEY }, "admin-1"))).toBe("FLOW_SECRET_FORBIDDEN");
  });
});

describe("handleGetFlowCredentialsStatus", () => {
  it("sin versiones: nada configurado", async () => {
    expect(await handleGetFlowCredentialsStatus(fakeStore())).toEqual({
      apiKey: { configured: false, updatedAt: null, hint: null },
      secretKey: { configured: false, updatedAt: null },
    });
  });
});

describe("makeLatestSecretReader", () => {
  it("cachea por nombre durante el TTL y vuelve a leer al vencer", async () => {
    let now = 0;
    const store = fakeStore({ FLOW_API_KEY: "uno-uno-uno" });
    const read = makeLatestSecretReader(store, 1000, () => now);
    expect(await read("FLOW_API_KEY")).toBe("uno-uno-uno");
    await store.addVersion("FLOW_API_KEY", "dos-dos-dos");
    now = 999;
    expect(await read("FLOW_API_KEY")).toBe("uno-uno-uno");
    now = 1000;
    expect(await read("FLOW_API_KEY")).toBe("dos-dos-dos");
  });

  it("invalidate obliga a releer", async () => {
    const store = fakeStore({ FLOW_API_KEY: "uno-uno-uno" });
    const read = makeLatestSecretReader(store, 60_000, () => 0);
    await read("FLOW_API_KEY");
    await store.addVersion("FLOW_API_KEY", "dos-dos-dos");
    read.invalidate();
    expect(await read("FLOW_API_KEY")).toBe("dos-dos-dos");
  });

  it("si Secret Manager falla, sigue con el último valor bueno", async () => {
    let now = 0;
    const store = fakeStore({ FLOW_API_KEY: "uno-uno-uno" });
    const read = makeLatestSecretReader(store, 1000, () => now);
    await read("FLOW_API_KEY");
    store.accessLatest = vi.fn(async () => {
      throw new Error("caído");
    });
    now = 5000;
    expect(await read("FLOW_API_KEY")).toBe("uno-uno-uno");
  });
});
