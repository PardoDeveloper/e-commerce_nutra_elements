// Constructores de JSON-LD (contratos 01 a 06). Solo servidor.
// Nada de teléfono, correo, redes ni logo: son PENDIENTE y se omiten (D-023).
import { FAQ_SECTIONS } from "./content";
import { SITE_NAME } from "@/lib/site";
import { absoluteUrl } from "./metadata";

export type JsonLdNode = Record<string, unknown>;

export const orgId = () => absoluteUrl("/#organization");
export const storeId = () => absoluteUrl("/#store");

/** Serializa para un <script type="application/ld+json">: escapa "<" para que no cierre la etiqueta. */
export function serializeJsonLd(data: JsonLdNode): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function graph(...nodes: JsonLdNode[]): JsonLdNode {
  return { "@context": "https://schema.org", "@graph": nodes };
}

export interface Crumb {
  name: string;
  /** Ruta; el último elemento no lleva. */
  path?: string;
}

export function breadcrumbList(crumbs: Crumb[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...(c.path ? { item: absoluteUrl(c.path) } : {}),
    })),
  };
}

export function organizationNode(): JsonLdNode {
  return { "@type": "Organization", "@id": orgId(), name: SITE_NAME, url: absoluteUrl("/") };
}

/** FAQPage con todas las preguntas frecuentes (van al final de la página principal). */
export function faqPageNode(): JsonLdNode {
  return {
    "@type": "FAQPage",
    "@id": absoluteUrl("/#preguntas-frecuentes"),
    mainEntity: FAQ_SECTIONS.flatMap((s) =>
      s.items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
    ),
  };
}

export function websiteNode(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    url: absoluteUrl("/"),
    name: SITE_NAME,
    inLanguage: "es-CL",
    publisher: { "@id": orgId() },
  };
}

export function collectionPageNode(name: string, path: string, productSlugs: string[]): JsonLdNode {
  return {
    "@type": "CollectionPage",
    name,
    url: absoluteUrl(path),
    inLanguage: "es-CL",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: productSlugs.map((slug, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/productos/${slug}`),
      })),
    },
  };
}

/** Dígito verificador GTIN-13. `gtin13` solo se emite si valida. */
export function isValidGtin13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

interface ProductNodeInput {
  name: string;
  slug: string;
  sku: string;
  description: string;
  /** Opcional (D-040): sin categoría se omite. */
  category?: string;
  price: number;
  inStock: boolean;
  shippingFee: number;
  /** URLs absolutas de imágenes reales. Si no hay, se omite `image`. */
  images: string[];
  gtin13?: string | null;
}

/** Product + Offer. Sin aggregateRating ni review (D-014). */
export function productNode(p: ProductNodeInput): JsonLdNode {
  const url = absoluteUrl(`/productos/${p.slug}`);
  return {
    "@type": "Product",
    "@id": `${url}#product`,
    name: p.name,
    description: p.description,
    ...(p.images.length > 0 ? { image: p.images } : {}),
    sku: p.sku,
    ...(p.gtin13 && isValidGtin13(p.gtin13) ? { gtin13: p.gtin13 } : {}),
    brand: { "@type": "Brand", name: SITE_NAME },
    ...(p.category ? { category: p.category } : {}),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "CLP",
      price: p.price,
      availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": orgId() },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: p.shippingFee, currency: "CLP" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "CL", addressRegion: "RM" },
      },
    },
  };
}
