import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/data/types";
import { FEATURED_LIMIT, pickFeatured } from "./featured";

const make = (sku: string, over: Partial<Product> = {}): Product => ({
  sku,
  name: sku,
  slug: sku.toLowerCase(),
  description: null,
  shortDescription: null,
  categoryId: "vitaminas",
  images: [],
  price: 1000,
  discount: null,
  finalPrice: 1000,
  inStock: true,
  format: null,
  unitsPerPack: null,
  featured: false,
  seo: null,
  ...over,
});

describe("pickFeatured", () => {
  it("muestra solo los marcados por el admin, primero los que tienen stock", () => {
    const products = [make("A"), make("B", { featured: true, inStock: false }), make("C", { featured: true })];
    expect(pickFeatured(products, ["vitaminas"]).map((p) => p.sku)).toEqual(["C", "B"]);
  });

  it("limita los marcados a FEATURED_LIMIT", () => {
    const products = Array.from({ length: FEATURED_LIMIT + 3 }, (_, i) => make(`P${i}`, { featured: true }));
    expect(pickFeatured(products, [])).toHaveLength(FEATURED_LIMIT);
  });

  it("sin marcados, elige uno con stock por categoría y completa hasta 8", () => {
    const products = [
      make("V1"),
      make("V2"),
      make("M1", { categoryId: "magnesio", inStock: false }),
      make("M2", { categoryId: "magnesio" }),
      ...Array.from({ length: 10 }, (_, i) => make(`X${i}`)),
    ];
    const picked = pickFeatured(products, ["vitaminas", "magnesio"]);
    expect(picked.slice(0, 2).map((p) => p.sku)).toEqual(["V1", "M2"]);
    expect(picked).toHaveLength(8);
    expect(picked.every((p) => p.inStock)).toBe(true);
  });
});
