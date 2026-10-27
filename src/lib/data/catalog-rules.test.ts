import { describe, expect, it } from "vitest";
import { categorize, displayName, rowToProduct, slugify, unitsPerPack } from "./catalog-rules";

describe("reglas del catálogo de la demo", () => {
  it("genera el nombre para mostrar en formato título", () => {
    expect(displayName("VITAMINA B12 X 90 CAPS NUTRA ELEMENTS")).toBe("Vitamina B12 x 90 cápsulas");
    expect(displayName("B-COMPLEX 60 CAPS NUTRA ELEMENTS")).toBe("B-Complex x 60 cápsulas");
    expect(displayName("CITRATO POTASIO X 30 CAPS NUTRA ELEMENTS")).toBe("Citrato de Potasio x 30 cápsulas");
    expect(displayName("MELENA DE LEON X 90 CAPS NUTRA ELEMENTS")).toBe("Melena de León x 90 cápsulas");
    expect(displayName("VITAMINA D 800 UI X 30 CAPS NUTRA ELEMENTS")).toBe("Vitamina D 800 UI x 30 cápsulas");
    expect(displayName("VIT TOTAL 90 CAPS NUTRA ELEMENTS")).toBe("Vitamina Total x 90 cápsulas");
  });

  it("genera slugs válidos sin la x ni tildes", () => {
    const slug = slugify("Cúrcuma con Pimienta x 90 cápsulas");
    expect(slug).toBe("curcuma-con-pimienta-90-capsulas");
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(unitsPerPack("Omega 3 x 90 cápsulas")).toBe(90);
  });

  it("asigna las categorías de D-023", () => {
    const cases: Array<[string, string]> = [
      ["ULTRA LIGHT X 120 CAPS", "bienestar"],
      ["ULTRA LAX 120 CAPS", "bienestar"],
      ["ULTRA ZINC X 90 CAPS", "minerales"],
      ["CITRATO POTASIO X 30 CAPS", "minerales"],
      ["TRIPLE MAGNESIO QUELADO 90 CAPS", "magnesio"],
      ["OMEGA 369 X 90 CAPS", "omega-3"],
      ["COLAGENO 500 MG X 60 CAPS", "belleza"],
      ["BIOTINA 120 CAPS", "belleza"],
      ["VITAMINA C 1000 MG X 90 CAPS", "vitaminas"],
      ["B-COMPLEX 60 CAPS", "vitaminas"],
      ["CRANBERRY + VIT C + VIT E X 120 CAPS", "bienestar"],
      ["CURCUMA PIMIENTA X 90 CAPS", "bienestar"],
    ];
    for (const [name, expected] of cases) expect(categorize(name).category, name).toBe(expected);
  });

  it("solo conserva si hay stock, nunca la cantidad", () => {
    const row = { ID: 2427844, NOMBRE: "VITAMINA B12 X 90 CAPS NUTRA ELEMENTS", PRECIO_VENTA_PUBLICO: 9990 };
    const withStock = rowToProduct({ ...row, STOCK_ACTUAL: 7 });
    const negative = rowToProduct({ ...row, STOCK_ACTUAL: -5 });
    const empty = rowToProduct({ ...row, STOCK_ACTUAL: null });
    expect(withStock?.inStock).toBe(true);
    expect(negative?.inStock).toBe(false);
    expect(empty?.inStock).toBe(false);
    expect(withStock?.sku).toBe("2427844");
    expect(Object.keys(withStock ?? {})).not.toContain("stock");
    expect(JSON.stringify(withStock)).not.toContain('"stock"');
  });

  it("descarta filas inválidas", () => {
    expect(rowToProduct({ ID: "", NOMBRE: "X", PRECIO_VENTA_PUBLICO: 100, STOCK_ACTUAL: 1 })).toBeNull();
    expect(rowToProduct({ ID: "1", NOMBRE: "X", PRECIO_VENTA_PUBLICO: 0, STOCK_ACTUAL: 1 })).toBeNull();
  });
});
