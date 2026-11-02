import { describe, expect, it } from "vitest";
import { searchProducts, type SearchEntry } from "./search";

function entry(name: string, inStock = true): SearchEntry {
  return { sku: name, name, slug: name, categoryId: null, price: 1000, finalPrice: 1000, inStock, image: null };
}

const entries = [
  entry("Vitamina C"),
  entry("Colágeno Hidrolizado"),
  entry("Omega 369"),
  entry("Magnesio Bisglicinato"),
  entry("Complejo B", false),
];

describe("searchProducts", () => {
  it("sugiere desde las primeras letras, sin tildes ni mayúsculas", () => {
    expect(searchProducts(entries, "co").map((e) => e.name)).toEqual(["Colágeno Hidrolizado", "Complejo B"]);
    expect(searchProducts(entries, "COLAGENO").map((e) => e.name)).toEqual(["Colágeno Hidrolizado"]);
  });

  it("exige todos los términos y prioriza el inicio de palabra", () => {
    expect(searchProducts(entries, "bisgli magnesio").map((e) => e.name)).toEqual(["Magnesio Bisglicinato"]);
    expect(searchProducts(entries, "c").map((e) => e.name)[0]).toBe("Colágeno Hidrolizado");
  });

  it("no devuelve nada con la búsqueda vacía y respeta el límite", () => {
    expect(searchProducts(entries, "   ")).toEqual([]);
    expect(searchProducts(entries, "a", 2)).toHaveLength(2);
  });
});
