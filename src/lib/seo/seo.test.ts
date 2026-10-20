import { describe, expect, it } from "vitest";
import { breadcrumbList, isValidGtin13, productNode, serializeJsonLd } from "./jsonld";
import { baseName, displayName, productMetaDescription } from "./metadata";

describe("displayName y baseName", () => {
  it("quita la x del rótulo", () => {
    expect(displayName("Citrato de Magnesio x 120 cápsulas")).toBe("Citrato de Magnesio 120 cápsulas");
    expect(baseName("Vitamina C 1000 mg x 90 cápsulas")).toBe("Vitamina C 1000 mg");
  });
  it("la descripción meta no lleva precio y cabe en 155", () => {
    const d = productMetaDescription("Citrato de Magnesio x 120 cápsulas", 120);
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d).not.toMatch(/\$/);
  });
});

describe("JSON-LD", () => {
  it("escapa < para no cerrar el script", () => {
    expect(serializeJsonLd({ a: "</script>" })).not.toContain("<");
  });
  it("valida el dígito verificador de GTIN-13", () => {
    expect(isValidGtin13("4006381333931")).toBe(true);
    expect(isValidGtin13("4006381333932")).toBe(false);
    expect(isValidGtin13("123")).toBe(false);
  });
  it("Product no trae aggregateRating ni review y omite image/gtin sin datos", () => {
    const node = productNode({
      name: "X 30 cápsulas",
      slug: "x-30-capsulas",
      sku: "1",
      description: "d",
      category: "C",
      price: 1000,
      inStock: false,
      shippingFee: 3990,
      images: [],
      gtin13: "0000000000001",
    });
    const json = JSON.stringify(node);
    expect(json).not.toMatch(/aggregateRating|review|gtin13|"image"/);
    expect(json).toContain("OutOfStock");
  });
  it("la última miga no lleva item", () => {
    const b = breadcrumbList([{ name: "Inicio", path: "/" }, { name: "Fin" }]) as { itemListElement: Array<Record<string, unknown>> };
    expect(b.itemListElement[1]).not.toHaveProperty("item");
  });
});
