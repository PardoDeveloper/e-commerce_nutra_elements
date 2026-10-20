import { describe, expect, it } from "vitest";
import { isEmptyCell, normalizeSku, parsePrice, parseStock } from "./cells.js";

describe("normalizeSku", () => {
  it.each([
    [2427844, "2427844"],
    ["2427844", "2427844"],
    ["2427844.0", "2427844"],
    [" 2427844 ", "2427844"],
    ["AB-12_c", "AB-12_c"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeSku(input)).toBe(expected);
  });

  it.each([null, undefined, "", "   ", 12.5, "12.5", "a/b", "x".repeat(33), Number.NaN, Number.POSITIVE_INFINITY, "a b"])("%j es inválido", (input) => {
    expect(normalizeSku(input as never)).toBeNull();
  });
});

describe("parsePrice", () => {
  it.each([
    [12990, 12990],
    ["12990", 12990],
    ["12.990", 12990],
    ["$12.990", 12990],
    ["$ 1.234.567", 1234567],
    ["12990,0", 12990],
    ["12990.00", 12990],
    [1, 1],
    [10_000_000, 10_000_000],
  ])("%j -> %j", (input, value) => {
    expect(parsePrice(input)).toEqual({ ok: true, value });
  });

  it.each([null, undefined, "", "abc", 0, -5, "-5", 12.5, "12,5", "12.5", "1,000", 10_000_001, "10.000.001", Number.NaN, "1e5"])("%j es inválido", (input) => {
    expect(parsePrice(input as never)).toEqual({ ok: false });
  });
});

describe("parseStock", () => {
  it("entero válido", () => {
    expect(parseStock(14)).toEqual({ kind: "ok", value: 14 });
    expect(parseStock("14")).toEqual({ kind: "ok", value: 14 });
    expect(parseStock(0)).toEqual({ kind: "ok", value: 0 });
    expect(parseStock("1.000")).toEqual({ kind: "ok", value: 1000 }); // miles chilenos, no 1
  });
  it("vacío (null, undefined, cadena en blanco)", () => {
    expect(parseStock(null)).toEqual({ kind: "empty" });
    expect(parseStock(undefined)).toEqual({ kind: "empty" });
    expect(parseStock("   ")).toEqual({ kind: "empty" });
  });
  it("negativo se corrige a 0 y conserva el valor original", () => {
    expect(parseStock(-5)).toEqual({ kind: "corrected", value: 0, from: -5 });
    expect(parseStock("-3")).toEqual({ kind: "corrected", value: 0, from: "-3" });
  });
  it("texto no numérico, decimales o fuera de rango son inválidos", () => {
    expect(parseStock("abc")).toEqual({ kind: "invalid" });
    expect(parseStock(2.5)).toEqual({ kind: "invalid" });
    expect(parseStock(1_000_001)).toEqual({ kind: "invalid" });
    expect(parseStock("1,000")).toEqual({ kind: "invalid" });
  });
  it("no devuelve -0", () => {
    const r = parseStock("-0");
    expect(r).toEqual({ kind: "ok", value: 0 });
    expect(Object.is((r as { value: number }).value, -0)).toBe(false);
  });
});

describe("isEmptyCell", () => {
  it("detecta celdas vacías", () => {
    expect(isEmptyCell(null)).toBe(true);
    expect(isEmptyCell(undefined)).toBe(true);
    expect(isEmptyCell("  ")).toBe(true);
    expect(isEmptyCell(0)).toBe(false);
    expect(isEmptyCell("0")).toBe(false);
  });
});
