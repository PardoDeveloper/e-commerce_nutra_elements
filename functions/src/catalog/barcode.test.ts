import { describe, expect, it } from "vitest";
import { analyzeBarcode, isValidGtin } from "./barcode.js";
import { extractPackInfo, proposeDisplayName, slugify } from "./names.js";

describe("isValidGtin", () => {
  it.each(["4006381333931", "036000291452", "96385074", "00012345678905"])("%s es válido", (code) => {
    expect(isValidGtin(code)).toBe(true);
  });
  it.each(["4006381333932", "12345", "abc", "", "1234567890123456"])("%s es inválido", (code) => {
    expect(isValidGtin(code)).toBe(false);
  });
});

describe("analyzeBarcode", () => {
  it("válido fuera del rango ISBN: se publica como GTIN", () => {
    expect(analyzeBarcode("4006381333931")).toEqual({ barcode: "4006381333931", barcodeValid: true, gtin: "4006381333931", isbnRange: false, tooLong: false });
  });
  it("acepta una celda numérica", () => {
    expect(analyzeBarcode(4006381333931).gtin).toBe("4006381333931");
  });
  it("rango ISBN 978: válido pero sin GTIN", () => {
    const r = analyzeBarcode("9780306406157");
    expect(r.barcodeValid).toBe(true);
    expect(r.gtin).toBeNull();
    expect(r.isbnRange).toBe(true);
    expect(r.barcode).toBe("9780306406157");
  });
  it("dígito verificador incorrecto: se guarda pero no es GTIN", () => {
    const r = analyzeBarcode("4006381333932");
    expect(r).toMatchObject({ barcode: "4006381333932", barcodeValid: false, gtin: null });
  });
  it("vacío, demasiado largo o con caracteres de control", () => {
    expect(analyzeBarcode(null).barcode).toBeNull();
    expect(analyzeBarcode("  ").barcode).toBeNull();
    expect(analyzeBarcode("1".repeat(33))).toMatchObject({ barcode: null, tooLong: true });
    expect(analyzeBarcode("12\n34").barcode).toBeNull();
  });
});

describe("proposeDisplayName", () => {
  it.each([
    ["CITRATO DE MAGNESIO X 120 CAPS", "Citrato de Magnesio x 120 cápsulas"],
    ["VITAMINA B12 X 90 CAPS", "Vitamina B12 x 90 cápsulas"],
    ["VITAMINA E 400 UI X 60 CAPS", "Vitamina E 400 ui x 60 cápsulas"],
    ["B-COMPLEX X 60 CAPS", "B-Complex x 60 cápsulas"],
    ["  OMEGA   3  ", "Omega 3"],
  ])("%s", (input, expected) => {
    expect(proposeDisplayName(input)).toBe(expected);
  });
  it("no pasa de 120 caracteres", () => {
    expect(proposeDisplayName("A".repeat(300)).length).toBeLessThanOrEqual(120);
  });
});

describe("extractPackInfo y slugify", () => {
  it("extrae unidades, formato y familia", () => {
    expect(extractPackInfo("CITRATO DE MAGNESIO X 120 CAPS")).toEqual({ unitsPerPack: 120, format: "capsulas", family: "citrato-de-magnesio" });
    expect(extractPackInfo("ZINC X90")).toEqual({ unitsPerPack: 90, format: null, family: "zinc" });
  });
  it("sin sufijo X n no propone nada", () => {
    expect(extractPackInfo("SPIRULINA")).toEqual({ unitsPerPack: null, format: null, family: null });
  });
  it("unidades fuera de 1..1000 no se proponen", () => {
    expect(extractPackInfo("ALGO X 5000 CAPS").unitsPerPack).toBeNull();
  });
  it("slugify quita tildes y símbolos", () => {
    expect(slugify("Cúrcuma con Pimienta (Ultra)")).toBe("curcuma-con-pimienta-ultra");
    expect(slugify("!!!")).toBe("");
  });
});
