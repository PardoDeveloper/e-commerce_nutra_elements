// Feed de productos para Google Merchant Center (RSS 2.0 con el espacio de nombres g:). Solo servidor.
// Lo sirve /feeds/google-merchant.xml; Merchant Center lo descarga como feed programado.
// Los envíos y las devoluciones se configuran en la cuenta de Merchant Center, no aquí.
import type { Category, Product } from "@/lib/data";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import { absoluteUrl, displayName, productDescription } from "./metadata";

/** Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements (taxonomía de Google). */
export const GOOGLE_CATEGORY_SUPPLEMENTS = 525;
const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;
const MAX_ADDITIONAL_IMAGES = 10;
const GTIN = /^(\d{8}|\d{12,14})$/;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number): string {
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

function imageUrls(product: Product): string[] {
  return product.images.flatMap((i) => (i.url ? [/^https?:\/\//.test(i.url) ? i.url : absoluteUrl(i.url)] : []));
}

function item(product: Product, images: string[], categories: ReadonlyMap<string, string>): string {
  const category = product.categoryId ? categories.get(product.categoryId) : undefined;
  const gtin = product.gtin && GTIN.test(product.gtin) ? product.gtin : null;
  const lines = [
    tag("g:id", product.sku),
    tag("g:title", displayName(product.name).slice(0, MAX_TITLE)),
    tag("g:description", productDescription(product).slice(0, MAX_DESCRIPTION)),
    tag("g:link", absoluteUrl(`/productos/${product.slug}`)),
    tag("g:image_link", images[0]!),
    ...images.slice(1, 1 + MAX_ADDITIONAL_IMAGES).map((url) => tag("g:additional_image_link", url)),
    tag("g:availability", product.inStock ? "in_stock" : "out_of_stock"),
    tag("g:price", `${product.price} CLP`),
    ...(product.finalPrice < product.price ? [tag("g:sale_price", `${product.finalPrice} CLP`)] : []),
    tag("g:condition", "new"),
    tag("g:brand", SITE_NAME),
    // Marca propia: sin GTIN válido se identifica con el SKU como código del fabricante.
    gtin ? tag("g:gtin", gtin) : tag("g:mpn", product.sku),
    tag("g:google_product_category", GOOGLE_CATEGORY_SUPPLEMENTS),
    ...(category ? [tag("g:product_type", category)] : []),
  ];
  return `<item>\n${lines.map((l) => `  ${l}`).join("\n")}\n</item>`;
}

/**
 * Arma el feed con los productos públicos. Los productos sin imagen se omiten: Merchant Center los
 * rechaza (image_link es obligatorio). Devuelve también cuántos se omitieron.
 */
export function buildMerchantFeed(products: readonly Product[], categories: readonly Category[]): { xml: string; skipped: number } {
  const names = new Map(categories.map((c) => [c.slug, c.name]));
  const items: string[] = [];
  let skipped = 0;
  for (const product of products) {
    const images = imageUrls(product);
    if (images.length === 0) {
      skipped++;
      continue;
    }
    items.push(item(product, images, names));
  }
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    tag("title", SITE_NAME),
    tag("link", absoluteUrl("/")),
    tag("description", SITE_DESCRIPTION),
    ...items,
    "</channel>",
    "</rss>",
    "",
  ].join("\n");
  return { xml, skipped };
}
