import { getCategories, getProducts } from "@/lib/data";
import { buildMerchantFeed } from "@/lib/seo";
import { isIndexable } from "@/lib/site";

// Feed de productos para Google Merchant Center (feed programado). Estático con ISR: se regenera cada hora,
// igual que las fichas. Antes del lanzamiento (sin SITE_INDEXABLE="true") no se publica.
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  if (!isIndexable()) return new Response("Not Found", { status: 404 });
  const [products, categories] = await Promise.all([getProducts(), getCategories()]);
  const { xml } = buildMerchantFeed(products, categories);
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Solo para Merchant Center: el feed no es una página que deba aparecer en el buscador.
      "X-Robots-Tag": "noindex",
    },
  });
}
