import { describe, expect, it } from "vitest";
import { computeRutDv, isValidRut, normalizeRut } from "./rut.js";

describe("computeRutDv (módulo 11)", () => {
  // Cuerpos y dígitos calculados a mano (ejemplo 20000003: suma 12, 12 mod 11 = 1, 11-1 = 10 -> K).
  const table: [string, string][] = [
    ["20000008", "0"],
    ["20000002", "1"],
    ["20000007", "2"],
    ["20000001", "3"],
    ["20000006", "4"],
    ["20000000", "5"],
    ["20000005", "6"],
    ["20000013", "7"],
    ["20000004", "8"],
    ["20000009", "9"],
    ["20000003", "K"],
    ["12345678", "5"],
    ["18972631", "7"],
  ];
  it.each(table)("cuerpo %s -> dígito %s", (body, dv) => {
    expect(computeRutDv(body)).toBe(dv);
  });
});

describe("normalizeRut: RUT válidos", () => {
  it.each([
    ["12345678-5", "12345678-5"],
    ["123456785", "12345678-5"],
    ["12.345.678-5", "12345678-5"],
    ["12.345.6785", "12345678-5"],
    ["  12345678-5  ", "12345678-5"],
    ["18972631-7", "18972631-7"],
    ["7654321-6", "7654321-6"],
    ["7.654.321-6", "7654321-6"],
    ["1.000.000-9", "1000000-9"],
    ["20000003-K", "20000003-K"],
    ["20000003-k", "20000003-K"],
    ["20.000.003-k", "20000003-K"],
    ["20000003k", "20000003-K"],
    ["20000008-0", "20000008-0"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeRut(input)).toBe(expected);
    expect(isValidRut(input)).toBe(true);
  });

  it("la salida cumple el formato del modelo de datos", () => {
    for (const r of ["12.345.678-5", "20000003k", "7654321-6"]) {
      expect(normalizeRut(r)).toMatch(/^\d{7,8}-[0-9K]$/);
    }
  });

  it("es idempotente", () => {
    const once = normalizeRut("12.345.678-5");
    expect(normalizeRut(once)).toBe(once);
  });
});

describe("normalizeRut: RUT inválidos", () => {
  it.each([
    ["dígito verificador incorrecto", "12345678-4"],
    ["K donde no corresponde", "12345678-K"],
    ["0 donde no corresponde", "12345678-0"],
    ["vacío", ""],
    ["solo espacios", "   "],
    ["sin dígito verificador", "12345678-"],
    ["muy corto", "123456-5"],
    ["muy largo", "123456789-5"],
    ["con letras en el cuerpo", "1234A678-5"],
    ["puntos mal puestos", "1.2345.678-5"],
    ["puntos de más", "12.345.67.8-5"],
    ["guion doble", "12345678--5"],
    ["cuerpo con cero a la izquierda", "012345678"],
    ["con otros símbolos", "12345678_5"],
    ["con espacios internos", "12 345 678-5"],
    ["texto enorme", "1".repeat(500)],
  ])("%s", (_name, input) => {
    expect(normalizeRut(input)).toBeNull();
    expect(isValidRut(input)).toBe(false);
  });

  it("rechaza valores que no son texto", () => {
    for (const v of [undefined, null, 123456785, {}, [], true]) {
      expect(normalizeRut(v)).toBeNull();
    }
  });
});
