import { describe, expect, it } from "vitest";
import { isAllowedPath, parseBody, signBody, verifyRequest } from "./verify";

const SECRET = "secreto-de-prueba";
const NOW = 1_800_000_000_000;
const ts = String(Math.floor(NOW / 1000));
const body = JSON.stringify({ paths: ["/", "/productos"], tags: ["catalog"] });

describe("verifyRequest", () => {
  it("acepta una firma válida", () => {
    expect(verifyRequest(SECRET, ts, signBody(SECRET, ts, body), body, NOW)).toBe("ok");
  });
  it("rechaza firma incorrecta, cuerpo alterado o secreto distinto", () => {
    const sig = signBody(SECRET, ts, body);
    expect(verifyRequest(SECRET, ts, "0".repeat(64), body, NOW)).toBe("invalid");
    expect(verifyRequest(SECRET, ts, sig, body + " ", NOW)).toBe("invalid");
    expect(verifyRequest("otro", ts, sig, body, NOW)).toBe("invalid");
  });
  it("rechaza cabeceras ausentes o mal formadas", () => {
    const sig = signBody(SECRET, ts, body);
    expect(verifyRequest(SECRET, null, sig, body, NOW)).toBe("invalid");
    expect(verifyRequest(SECRET, ts, null, body, NOW)).toBe("invalid");
    expect(verifyRequest(SECRET, ts, "zz", body, NOW)).toBe("invalid");
    expect(verifyRequest(SECRET, "abc", sig, body, NOW)).toBe("invalid");
  });
  it("sin secreto configurado falla cerrado", () => {
    expect(verifyRequest(undefined, ts, signBody("", ts, body), body, NOW)).toBe("invalid");
    expect(verifyRequest("", ts, signBody("", ts, body), body, NOW)).toBe("invalid");
  });
  it("respeta la ventana de 5 minutos", () => {
    const old = String(Math.floor(NOW / 1000) - 301);
    const edge = String(Math.floor(NOW / 1000) - 300);
    expect(verifyRequest(SECRET, old, signBody(SECRET, old, body), body, NOW)).toBe("invalid");
    expect(verifyRequest(SECRET, edge, signBody(SECRET, edge, body), body, NOW)).toBe("ok");
    const future = String(Math.floor(NOW / 1000) + 301);
    expect(verifyRequest(SECRET, future, signBody(SECRET, future, body), body, NOW)).toBe("invalid");
  });
});

describe("isAllowedPath", () => {
  it("acepta la lista blanca", () => {
    for (const p of ["/", "/productos", "/productos/citrato-de-magnesio-120-capsulas", "/categorias/omega-3", "/sitemap.xml"]) {
      expect(isAllowedPath(p)).toBe(true);
    }
  });
  it("rechaza lo demás", () => {
    const bad = ["/admin", "/checkout", "/api/revalidate", "/productos/", "/productos/A", "/productos/a/b", "/productos/../admin", "//evil.com", "productos", "/productos?x=1", 5, null];
    for (const p of bad) expect(isAllowedPath(p)).toBe(false);
    expect(isAllowedPath("/productos/" + "a".repeat(81))).toBe(false);
  });
});

describe("parseBody", () => {
  it("acepta un cuerpo válido y quita duplicados", () => {
    expect(parseBody(JSON.stringify({ paths: ["/", "/"], tags: ["settings"] }))).toEqual({ paths: ["/"], tags: ["settings"] });
    expect(parseBody(JSON.stringify({ paths: ["/productos"] }))).toEqual({ paths: ["/productos"], tags: [] });
  });
  it("rechaza entradas inválidas", () => {
    expect(parseBody("no es json")).toBeNull();
    expect(parseBody("[]")).toBeNull();
    expect(parseBody("{}")).toBeNull();
    expect(parseBody(JSON.stringify({ paths: ["/admin"] }))).toBeNull();
    expect(parseBody(JSON.stringify({ paths: "/" }))).toBeNull();
    expect(parseBody(JSON.stringify({ tags: ["otra"] }))).toBeNull();
    expect(parseBody(JSON.stringify({ paths: ["/"], extra: 1 }))).toBeNull();
    expect(parseBody(JSON.stringify({ paths: Array.from({ length: 51 }, (_, i) => `/productos/p${i}`) }))).toBeNull();
  });
});
