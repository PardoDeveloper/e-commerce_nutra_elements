import { describe, expect, it } from "vitest";
import {
  commerceOrderFor,
  consumeAttempt,
  currentCount,
  formatOrderNumber,
  generateAccessToken,
  hashAccessToken,
  isOrderNumber,
  parseCommerceOrder,
  rateLimitDoc,
  rateLimitKey,
  readRateWindow,
  safeEqualHex,
  sha256Hex,
} from "./primitives.js";
import { clientIpFrom } from "./client-ip.js";

describe("token de acceso", () => {
  it("son 43 caracteres base64url y distintos entre sí", () => {
    const a = generateAccessToken();
    const b = generateAccessToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("el hash es SHA-256 hexadecimal conocido", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashAccessToken("abc")).toBe(sha256Hex("abc"));
  });

  it("safeEqualHex compara en igualdad y rechaza largos distintos", () => {
    expect(safeEqualHex("aa", "aa")).toBe(true);
    expect(safeEqualHex("aa", "ab")).toBe(false);
    expect(safeEqualHex("aa", "aaaa")).toBe(false);
    expect(safeEqualHex("", "")).toBe(true);
  });
});

describe("número de pedido", () => {
  it("formatea con ceros a la izquierda y crece pasado 999999", () => {
    expect(formatOrderNumber(1)).toBe("NE-000001");
    expect(formatOrderNumber(123)).toBe("NE-000123");
    expect(formatOrderNumber(999999)).toBe("NE-999999");
    expect(formatOrderNumber(1000000)).toBe("NE-1000000");
  });

  it("rechaza números no válidos", () => {
    for (const n of [0, -1, 1.5, Number.NaN, 2 ** 60]) expect(() => formatOrderNumber(n)).toThrow(RangeError);
  });

  it("isOrderNumber", () => {
    expect(isOrderNumber("NE-000123")).toBe(true);
    for (const v of ["NE-123", "ne-000123", "NE-000123-2", "NE-00012a", "", 5, null]) expect(isOrderNumber(v)).toBe(false);
  });

  it("commerceOrder de Flow: el número en el intento 1 y sufijo después", () => {
    expect(commerceOrderFor("NE-000123", 1)).toBe("NE-000123");
    expect(commerceOrderFor("NE-000123", 2)).toBe("NE-000123-2");
    expect(parseCommerceOrder("NE-000123")).toEqual({ orderNumber: "NE-000123", attempt: 1 });
    expect(parseCommerceOrder("NE-000123-3")).toEqual({ orderNumber: "NE-000123", attempt: 3 });
    for (const v of ["NE-000123-0", "NE-000123-", "XX-000123", "NE-000123-2-2", "NE-12", ""]) expect(parseCommerceOrder(v)).toBeNull();
  });
});

describe("ventana de intentos", () => {
  const W = 10 * 60_000;
  const t0 = new Date("2026-10-20T15:00:00Z");

  it("el primer intento abre la ventana", () => {
    const r = consumeAttempt(undefined, t0, W, 3);
    expect(r).toEqual({ allowed: true, next: { count: 1, windowStart: t0 } });
  });

  it("cuenta hasta el máximo y luego bloquea sin cambiar el estado", () => {
    let state = consumeAttempt(undefined, t0, W, 3).next;
    state = consumeAttempt(state, new Date(t0.getTime() + 1000), W, 3).next;
    const third = consumeAttempt(state, new Date(t0.getTime() + 2000), W, 3);
    expect(third.allowed).toBe(true);
    expect(third.next.count).toBe(3);
    const fourth = consumeAttempt(third.next, new Date(t0.getTime() + 3000), W, 3);
    expect(fourth.allowed).toBe(false);
    expect(fourth.next).toEqual(third.next);
  });

  it("al vencer la ventana vuelve a permitir y reinicia el conteo", () => {
    const full = { count: 3, windowStart: t0 };
    const later = new Date(t0.getTime() + W);
    expect(currentCount(full, later, W)).toBe(0);
    const r = consumeAttempt(full, later, W, 3);
    expect(r.allowed).toBe(true);
    expect(r.next).toEqual({ count: 1, windowStart: later });
  });

  it("el documento lleva TTL de un día y la clave no contiene la IP", () => {
    const doc = rateLimitDoc({ count: 2, windowStart: t0 });
    expect(doc.expiresAt.getTime() - t0.getTime()).toBe(24 * 3600_000);
    const key = rateLimitKey("createOrder", "203.0.113.5");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("203");
    expect(rateLimitKey("createOrder", "203.0.113.5")).toBe(key);
    expect(rateLimitKey("getOrderStatus", "203.0.113.5")).not.toBe(key);
  });

  it("readRateWindow tolera documentos ausentes o corruptos", () => {
    expect(readRateWindow(undefined)).toBeUndefined();
    expect(readRateWindow({ count: "x", windowStart: t0 })).toBeUndefined();
    expect(readRateWindow({ count: 2, windowStart: t0 })).toEqual({ count: 2, windowStart: t0 });
  });
});

describe("clientIpFrom", () => {
  it("usa la última entrada de X-Forwarded-For (las anteriores las puede inventar el cliente)", () => {
    expect(clientIpFrom({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" })).toBe("203.0.113.9");
  });
  it("cae a la IP de la conexión y rechaza valores que no son IP", () => {
    expect(clientIpFrom({}, "198.51.100.7")).toBe("198.51.100.7");
    expect(clientIpFrom({ "x-forwarded-for": "no-es-ip" }, "198.51.100.7")).toBe("198.51.100.7");
    expect(clientIpFrom({}, "tampoco")).toBeUndefined();
    expect(clientIpFrom({})).toBeUndefined();
  });
  it("admite IPv6 y cabecera en arreglo", () => {
    expect(clientIpFrom({ "x-forwarded-for": ["10.0.0.1", "2001:db8::1"] })).toBe("2001:db8::1");
  });
});
