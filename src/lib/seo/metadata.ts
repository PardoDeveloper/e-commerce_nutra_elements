// Helpers de metadata SEO (contratos 01 a 06). Solo servidor.
import type { Metadata } from "next";
import { getSiteUrl, isIndexable, SITE_NAME } from "@/lib/site";

/** URL absoluta a partir de una ruta ("/" devuelve el origen con barra final). */
export function absoluteUrl(pathname: string): string {
  const base = getSiteUrl();
  return pathname === "/" ? `${base}/` : `${base}${pathname}`;
}

/** Nombre para mostrar sin la "x" del rótulo: "Citrato de Magnesio x 120 cápsulas" -> "Citrato de Magnesio 120 cápsulas". */
export function displayName(name: string): string {
  return name.replace(/\s+x\s+(?=\d)/i, " ");
}

/** robots por entorno (D-021): sin SITE_INDEXABLE="true" todo es noindex. `index: false` fuerza noindex,follow en lanzado. */
export function robotsFor(index = true): NonNullable<Metadata["robots"]> {
  if (!isIndexable()) return { index: false, follow: false };
  if (!index) return { index: false, follow: true };
  return { index: true, follow: true, "max-image-preview": "large" };
}

interface PageMetadataInput {
  /** Título completo (ya incluye la marca si corresponde). */
  title: string;
  description: string;
  /** Ruta canónica, sin parámetros. */
  path: string;
  /** false = noindex,follow aun en producción lanzada (contenido delgado). */
  index?: boolean;
}

/** Metadata completa: title absoluto, description, canonical, robots, Open Graph y Twitter. */
export function pageMetadata({ title, description, path, index = true }: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: robotsFor(index),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "es_CL",
      url,
      title,
      description,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Agrega " | Nutra Elements" solo si el título resultante cabe en 60 caracteres. */
export function withBrand(title: string): string {
  const full = `${title} | ${SITE_NAME}`;
  return full.length <= 60 ? full : title;
}

/** Nombre sin la cantidad final: "Vitamina C 1000 mg 90 cápsulas" -> "Vitamina C 1000 mg". */
export function baseName(name: string): string {
  return displayName(name).replace(/\s+\d+\s+cápsulas$/i, "").trim();
}

/** Descripción del producto; sin texto cargado, una neutra sin declaraciones de salud. */
export function productDescription(product: { name: string; description: string | null; unitsPerPack: number | null }): string {
  return (
    product.description ??
    `${baseName(product.name)} en ${product.unitsPerPack ? `frasco de ${product.unitsPerPack} cápsulas` : "cápsulas"}. Suplemento alimentario de Nutra Elements.`
  );
}

/** Meta descripción a partir de la descripción del producto: una línea, hasta 160 caracteres sin cortar palabras. */
export function metaDescriptionFrom(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:]+$/, "")}…`;
}

/** Descripción plantilla de la ficha (contrato 04), sin precio ni declaraciones de salud. */
export function productMetaDescription(name: string, units: number | null): string {
  const pack = units ? `frasco de ${units} cápsulas` : "cápsulas";
  return `${baseName(name)} en ${pack}, de Nutra Elements. Suplemento alimentario. Despacho en la RM o retiro en tienda en Puente Alto.`;
}
