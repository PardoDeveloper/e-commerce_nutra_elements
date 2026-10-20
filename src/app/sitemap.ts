import type { MetadataRoute } from "next";
import { getCategories, getProducts } from "@/lib/data";
import { absoluteUrl } from "@/lib/seo";
import { isIndexable } from "@/lib/site";

// Contrato SEO 06, sección 6. Vacío salvo con SITE_INDEXABLE="true".
// Solo URL públicas e indexables; sin lastModified porque el mock no tiene fecha real.
// Las categorías con menos de 3 productos llevan noindex y no entran.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable()) return [];
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);
  const staticPaths = [
    "/",
    "/productos",
    "/nosotros",
    "/contacto",
    "/preguntas-frecuentes",
    "/terminos",
    "/privacidad",
    "/cambios-y-devoluciones",
  ];
  const categoryPaths = categories
    .filter((c) => products.filter((p) => p.categoryId === c.slug).length >= 3)
    .map((c) => `/categorias/${c.slug}`);
  const productPaths = products.map((p) => `/productos/${p.slug}`);
  return [...staticPaths, ...categoryPaths, ...productPaths].map((p) => ({ url: absoluteUrl(p) }));
}
