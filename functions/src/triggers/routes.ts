// Lógica pura: qué rutas y etiquetas se revalidan cuando cambia un documento (contrato functions.md, sección 8).
// No toca Firestore ni la red.

export type DocData = Record<string, unknown> | undefined;

export interface RevalidationPlan {
  paths: string[];
  tags: string[];
}

// Formatos que acepta /api/revalidate (8.2): slug de producto/categoría y máximo de rutas.
const SLUG_REGEX = /^[a-z0-9-]{1,80}$/;
const MAX_PATHS = 50;

/** Campos de `products` que se ven en el sitio. Si ninguno cambia, no se revalida (evita una revalidación por compra). */
const PRODUCT_VISIBLE_FIELDS = [
  "name",
  "slug",
  "description",
  "shortDescription",
  "categoryId",
  "images",
  "price",
  "discount",
  "finalPrice",
  "inStock",
  "published",
  "active",
  "format",
  "unitsPerPack",
  "family",
  "seo",
  "gtin",
] as const;

const CATEGORY_VISIBLE_FIELDS = ["name", "description", "imagePath", "order", "published", "seo"] as const;

// `shippingFee` y `freeShippingThreshold` salen en la oferta del JSON-LD y en los textos de envío; `pickup` en /contacto.
const SETTINGS_VISIBLE_FIELDS = ["shippingFee", "freeShippingThreshold", "pickup", "communes", "maxQtyPerItem"] as const;

/** Igualdad profunda para valores de Firestore ya convertidos (primitivos, arreglos, mapas; Timestamp por `isEqual` o segundos). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  return ak.length === bk.length && ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
}

function changed(before: DocData, after: DocData, fields: readonly string[]): boolean {
  return fields.some((f) => !deepEqual(before?.[f], after?.[f]));
}

function validSlug(value: unknown): string | null {
  return typeof value === "string" && SLUG_REGEX.test(value) ? value : null;
}

/** Visible en la tienda: publicado, activo y no eliminado (mismas condiciones que las reglas de lectura pública). */
function isPublicProduct(doc: DocData): boolean {
  return doc !== undefined && doc["published"] === true && doc["active"] === true && (doc["deletedAt"] ?? null) === null;
}

function buildPlan(paths: Iterable<string>, tags: string[]): RevalidationPlan {
  return { paths: [...new Set(paths)].slice(0, MAX_PATHS), tags };
}

/**
 * Plan para un cambio en `products/{sku}`; `null` si no hay nada que revalidar.
 * Incluye la ficha y la categoría nuevas y las anteriores (cambio de slug/categoría, despublicación o eliminación).
 */
export function productRevalidation(before: DocData, after: DocData): RevalidationPlan | null {
  const wasPublic = isPublicProduct(before);
  const isPublic = isPublicProduct(after);
  // Antes y después fuera de la tienda (borrador, eliminado que sigue eliminado): nada se ve.
  if (!wasPublic && !isPublic) return null;
  // Eliminar/restaurar cambia `published` o `deletedAt`; `deletedAt` entra por isPublicProduct.
  if (wasPublic === isPublic && !changed(before, after, PRODUCT_VISIBLE_FIELDS)) return null;

  const paths: string[] = [];
  for (const [doc, visible] of [
    [before, wasPublic],
    [after, isPublic],
  ] as const) {
    if (!visible || doc === undefined) continue;
    const slug = validSlug(doc["slug"]);
    if (slug) paths.push(`/productos/${slug}`);
    const category = validSlug(doc["categoryId"]);
    if (category) paths.push(`/categorias/${category}`);
  }
  paths.push("/productos", "/", "/sitemap.xml");
  return buildPlan(paths, ["catalog"]);
}

/** Plan para `categories/{id}`; `null` si no cambió nada visible o no es pública ni antes ni después. */
export function categoryRevalidation(categoryId: string, before: DocData, after: DocData): RevalidationPlan | null {
  const wasPublic = before?.["published"] === true;
  const isPublic = after?.["published"] === true;
  if (!wasPublic && !isPublic) return null;
  if (!changed(before, after, CATEGORY_VISIBLE_FIELDS)) return null;
  const id = validSlug(categoryId);
  const paths = id ? [`/categorias/${id}`] : [];
  paths.push("/productos", "/", "/sitemap.xml");
  return buildPlan(paths, ["catalog"]);
}

/** Plan para `settings/public`: páginas con envío/retiro y la etiqueta `settings` (fichas con JSON-LD de oferta). */
export function settingsRevalidation(before: DocData, after: DocData): RevalidationPlan | null {
  if (!changed(before, after, SETTINGS_VISIBLE_FIELDS)) return null;
  return buildPlan(["/", "/productos", "/preguntas-frecuentes", "/contacto"], ["settings"]);
}
