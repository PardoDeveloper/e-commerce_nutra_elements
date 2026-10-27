import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./defaults";
import { mapCategory, mapProduct, mapSettings } from "./firestore-map";

const toUrl = (p: string) => `https://files.test/${encodeURIComponent(p)}`;
const doc = {
  sku: "2427831",
  name: "Citrato de Magnesio x 120 cápsulas",
  slug: "citrato-de-magnesio-120-capsulas",
  categoryId: "magnesio",
  images: [{ path: "products/2427831/k3f9a1b2c3.webp", alt: "Frasco" }, { alt: "sin ruta" }],
  price: 10990,
  discount: { type: "percent", value: 10 },
  finalPrice: 1, // valor guardado incorrecto: se recalcula
  stock: 14,
  reserved: 2,
  inStock: true,
  sourceName: "CITRATO",
  barcode: "7800000000009",
  unitsPerPack: 120,
  family: "citrato-de-magnesio",
  seo: { title: "T" },
};

describe("mapProduct", () => {
  it("mapea, recalcula el precio final y no expone stock ni campos internos", () => {
    const p = mapProduct("2427831", doc, toUrl)!;
    expect(p.finalPrice).toBe(9891);
    expect(p.inStock).toBe(true);
    expect(p.images).toEqual([{ path: "products/2427831/k3f9a1b2c3.webp", alt: "Frasco", url: toUrl("products/2427831/k3f9a1b2c3.webp") }]);
    expect(p.seo).toEqual({ title: "T" });
    for (const key of ["stock", "reserved", "sourceName", "barcode"]) expect(p).not.toHaveProperty(key);
  });
  it("omite documentos sin slug, nombre o precio válidos", () => {
    expect(mapProduct("x", { ...doc, slug: null }, toUrl)).toBeNull();
    expect(mapProduct("x", { ...doc, slug: "Mal Slug" }, toUrl)).toBeNull();
    expect(mapProduct("x", { ...doc, price: 0 }, toUrl)).toBeNull();
  });
  it("la categoría es opcional (D-040)", () => {
    expect(mapProduct("x", { ...doc, categoryId: null }, toUrl)?.categoryId).toBeNull();
    expect(mapProduct("x", { ...doc, categoryId: "Mal Slug" }, toUrl)?.categoryId).toBeNull();
  });
  it("inStock solo es true si el documento lo dice", () => {
    expect(mapProduct("x", { ...doc, inStock: undefined }, toUrl)!.inStock).toBe(false);
  });
});

describe("mapCategory", () => {
  it("solo mapea categorías publicadas", () => {
    expect(mapCategory("omega-3", { name: "Omega 3", order: 40, published: true })?.slug).toBe("omega-3");
    expect(mapCategory("omega-3", { name: "Omega 3", published: false })).toBeNull();
  });
});

describe("mapSettings", () => {
  it("usa los valores por defecto si no existe el documento", () => {
    expect(mapSettings(undefined)).toBe(DEFAULT_SETTINGS);
  });
  it("mapea los ajustes y rellena lo que falta", () => {
    const s = mapSettings({ shippingFee: 5000, freeShippingThreshold: 40000, communes: [{ code: "x", name: "X" }], maxQtyPerItem: 5, updatedAt: "t" });
    expect(s).toMatchObject({ shippingFee: 5000, freeShippingThreshold: 40000, maxQtyPerItem: 5, communes: [{ code: "x", name: "X" }] });
    expect(s.pickup).toEqual(DEFAULT_SETTINGS.pickup);
  });
});
