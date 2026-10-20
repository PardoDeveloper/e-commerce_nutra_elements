import { vi } from "vitest";

vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { mockDataLayer as data } from "./mock";

// Las pruebas son válidas tanto con catalog.local.json como con el fixture.
describe("capa de datos mock", () => {
  it("devuelve las 6 categorías ordenadas", async () => {
    const categories = await data.getCategories();
    expect(categories.map((c) => c.slug)).toEqual(["vitaminas", "magnesio", "minerales", "omega-3", "belleza", "bienestar"]);
    expect((await data.getCategory("magnesio"))?.name).toBe("Magnesio");
    expect(await data.getCategory("no-existe")).toBeNull();
  });

  it("los productos no exponen stock ni datos internos", async () => {
    const products = await data.getProducts();
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) {
      expect(p).not.toHaveProperty("stock");
      expect(p).not.toHaveProperty("reserved");
      expect(p).not.toHaveProperty("sourceName");
      expect(typeof p.inStock).toBe("boolean");
      expect(p.finalPrice).toBeLessThanOrEqual(p.price);
    }
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
    expect(new Set(products.map((p) => p.sku)).size).toBe(products.length);
  });

  it("filtra por categoría y por texto sin distinguir tildes", async () => {
    const all = await data.getProducts();
    const first = all[0];
    expect(first).toBeDefined();
    const inCategory = await data.getProducts({ category: first?.categoryId });
    expect(inCategory.every((p) => p.categoryId === first?.categoryId)).toBe(true);
    const byText = await data.getProducts({ q: ` ${first?.name.toUpperCase()} ` });
    expect(byText.map((p) => p.sku)).toContain(first?.sku);
    expect(await data.getProducts({ q: "zzzz-nada" })).toEqual([]);
    expect((await data.getProducts({ limit: 2 })).length).toBe(2);
  });

  it("getProduct y relacionados", async () => {
    const all = await data.getProducts();
    const first = all[0];
    expect((await data.getProduct(first?.slug ?? ""))?.sku).toBe(first?.sku);
    expect(await data.getProduct("no-existe")).toBeNull();
    const related = await data.getRelatedProducts(first?.sku ?? "", 4);
    expect(related.length).toBeLessThanOrEqual(4);
    expect(related.some((p) => p.sku === first?.sku)).toBe(false);
  });

  it("ajustes públicos con 52 comunas y retiro en tienda", async () => {
    const s = await data.getPublicSettings();
    expect(s.communes).toHaveLength(52);
    expect(s.pickup.address).toContain("Concha y Toro 180");
    expect(s.freeShippingThreshold).toBeNull();
  });
});
