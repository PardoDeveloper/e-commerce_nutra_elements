import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Category, Product } from "@/lib/data";
import { buildMerchantFeed, GOOGLE_CATEGORY_SUPPLEMENTS } from "./merchant-feed";

const categories: Category[] = [{ slug: "magnesio", name: "Magnesio", description: null, order: 20, seo: null }];

function product(over: Partial<Product> = {}): Product {
  return {
    sku: "2427831",
    name: "Citrato de Magnesio x 120 cápsulas",
    slug: "citrato-de-magnesio-120",
    description: "Aporta magnesio & más <diario>.",
    shortDescription: null,
    categoryId: "magnesio",
    images: [
      { path: "products/2427831/a.webp", alt: "a", url: "https://storage.example/a.webp" },
      { path: "products/2427831/b.webp", alt: "b", url: "/api/demo-images/2427831/b.webp" },
    ],
    price: 10990,
    discount: null,
    finalPrice: 10990,
    inStock: true,
    format: "capsulas",
    unitsPerPack: 120,
    featured: false,
    gtin: "4006381333931",
    seo: null,
    ...over,
  };
}

describe("buildMerchantFeed", () => {
  const original = process.env.SITE_URL;
  beforeEach(() => {
    process.env.SITE_URL = "https://nutraelements.cl";
  });
  afterEach(() => {
    process.env.SITE_URL = original;
  });

  it("arma el item con los atributos obligatorios y escapa el texto", () => {
    const { xml, skipped } = buildMerchantFeed([product()], categories);
    expect(skipped).toBe(0);
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain("<g:id>2427831</g:id>");
    expect(xml).toContain("<g:title>Citrato de Magnesio 120 cápsulas</g:title>");
    expect(xml).toContain("<g:description>Aporta magnesio &amp; más &lt;diario&gt;.</g:description>");
    expect(xml).toContain("<g:link>https://nutraelements.cl/productos/citrato-de-magnesio-120</g:link>");
    expect(xml).toContain("<g:image_link>https://storage.example/a.webp</g:image_link>");
    expect(xml).toContain("<g:additional_image_link>https://nutraelements.cl/api/demo-images/2427831/b.webp</g:additional_image_link>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).toContain("<g:price>10990 CLP</g:price>");
    expect(xml).not.toContain("<g:sale_price>");
    expect(xml).toContain("<g:brand>Nutra Elements</g:brand>");
    expect(xml).toContain("<g:gtin>4006381333931</g:gtin>");
    expect(xml).not.toContain("<g:mpn>");
    expect(xml).toContain(`<g:google_product_category>${GOOGLE_CATEGORY_SUPPLEMENTS}</g:google_product_category>`);
    expect(xml).toContain("<g:product_type>Magnesio</g:product_type>");
  });

  it("con descuento informa sale_price; agotado es out_of_stock; sin GTIN usa el SKU como mpn", () => {
    const { xml } = buildMerchantFeed(
      [product({ discount: { type: "percent", value: 10 }, finalPrice: 9891, inStock: false, gtin: null, categoryId: null })],
      categories,
    );
    expect(xml).toContain("<g:price>10990 CLP</g:price>");
    expect(xml).toContain("<g:sale_price>9891 CLP</g:sale_price>");
    expect(xml).toContain("<g:availability>out_of_stock</g:availability>");
    expect(xml).toContain("<g:mpn>2427831</g:mpn>");
    expect(xml).not.toContain("<g:gtin>");
    expect(xml).not.toContain("<g:product_type>");
  });

  it("sin descripción usa el texto neutro de la ficha", () => {
    const { xml } = buildMerchantFeed([product({ description: null })], categories);
    expect(xml).toContain("<g:description>Citrato de Magnesio en frasco de 120 cápsulas. Suplemento alimentario de Nutra Elements.</g:description>");
  });

  it("omite los productos sin imagen y los cuenta", () => {
    const { xml, skipped } = buildMerchantFeed([product(), product({ sku: "2", images: [] })], categories);
    expect(skipped).toBe(1);
    expect(xml.match(/<item>/g)).toHaveLength(1);
  });
});
