import type { MetadataRoute } from "next";
import { getSiteUrl, isIndexable } from "@/lib/site";

// Contrato SEO 06, sección 4. No se bloquean /carrito, /checkout ni /cuenta
// (Google debe poder leer su noindex); se bloquean /admin/ y /api/.
// Antes del lanzamiento: Disallow total y sin línea Sitemap.
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin/", "/api/"] }],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
