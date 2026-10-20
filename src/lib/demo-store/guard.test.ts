import { describe, expect, it } from "vitest";
import { isPersistenceEnabled } from "./config";
import { rejectWrite } from "./guard";

describe("activación de la persistencia", () => {
  it("queda desactivada sin la variable o con otro valor", () => {
    expect(isPersistenceEnabled({})).toBe(false);
    expect(isPersistenceEnabled({ DEMO_PERSISTENCE: "1" })).toBe(false);
    expect(isPersistenceEnabled({ DEMO_PERSISTENCE: "TRUE" })).toBe(false);
    expect(isPersistenceEnabled({ DEMO_PERSISTENCE: "false" })).toBe(false);
  });

  it("se activa solo con DEMO_PERSISTENCE=true, también con NODE_ENV=production", () => {
    expect(isPersistenceEnabled({ DEMO_PERSISTENCE: "true" })).toBe(true);
    expect(isPersistenceEnabled({ DEMO_PERSISTENCE: "true", NODE_ENV: "production" })).toBe(true);
  });

  it("queda desactivada en App Hosting / Cloud Run / Firebase aunque la variable esté puesta", () => {
    expect(isPersistenceEnabled({ DEMO_PERSISTENCE: "true", K_SERVICE: "nutra-elements" })).toBe(false);
    expect(isPersistenceEnabled({ DEMO_PERSISTENCE: "true", FIREBASE_CONFIG: "{}" })).toBe(false);
  });
});

const on = { DEMO_PERSISTENCE: "true" };
const req = (headers: Record<string, string>) => new Request("http://localhost:3000/api/demo-admin/products", { method: "POST", headers });

describe("guardia de escritura", () => {
  it("responde 404 con la persistencia desactivada", () => {
    expect(rejectWrite(req({ host: "localhost:3000", "x-demo-admin": "1" }), {})).toBe(404);
    expect(rejectWrite(req({ host: "localhost:3000", "x-demo-admin": "1" }), { ...on, K_SERVICE: "x" })).toBe(404);
  });

  it("acepta solo peticiones de este PC con la cabecera propia", () => {
    expect(rejectWrite(req({ host: "localhost:3000", "x-demo-admin": "1" }), on)).toBeNull();
    expect(rejectWrite(req({ host: "127.0.0.1:3100", "x-demo-admin": "1", origin: "http://127.0.0.1:3100" }), on)).toBeNull();
    expect(rejectWrite(req({ host: "[::1]:3000", "x-demo-admin": "1" }), on)).toBeNull();
  });

  it("rechaza otro host, otro origen y la falta de la cabecera", () => {
    expect(rejectWrite(req({ host: "192.168.1.20:3000", "x-demo-admin": "1" }), on)).toBe(403);
    expect(rejectWrite(req({ host: "localhost:3000", "x-demo-admin": "1", origin: "https://malo.example" }), on)).toBe(403);
    expect(rejectWrite(req({ host: "localhost:3000" }), on)).toBe(403);
  });
});
