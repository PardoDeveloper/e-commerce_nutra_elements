// Mapeo puro de documentos de Firestore a los tipos públicos (sin SDK, con tests).
// Nunca copia `stock`, `reserved` ni campos internos al tipo público.
import { computeFinalPrice } from "@/lib/admin/pricing";
import { DEFAULT_SETTINGS } from "./defaults";
import type { Category, Product, ProductDiscount, ProductImage, PublicSettings } from "./types";

type Doc = Record<string, unknown>;
export type UrlBuilder = (path: string) => string | undefined;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);

function mapDiscount(v: unknown): ProductDiscount | null {
  if (typeof v !== "object" || v === null) return null;
  const { type, value } = v as Doc;
  const n = int(value);
  if ((type !== "percent" && type !== "fixed") || n === null || n < 1) return null;
  return { type, value: n };
}

function mapSeo(v: unknown): { title?: string; description?: string } | null {
  if (typeof v !== "object" || v === null) return null;
  const { title, description } = v as Doc;
  const seo = { ...(str(title) ? { title: str(title)! } : {}), ...(str(description) ? { description: str(description)! } : {}) };
  return Object.keys(seo).length > 0 ? seo : null;
}

function mapImages(v: unknown, toUrl: UrlBuilder): ProductImage[] {
  if (!Array.isArray(v)) return [];
  const images: ProductImage[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) continue;
    const path = str((item as Doc).path);
    if (!path) continue;
    const url = toUrl(path);
    images.push({ path, alt: str((item as Doc).alt) ?? "", ...(url ? { url } : {}) });
  }
  return images;
}

/** Devuelve null si el documento no sirve para mostrarse (sin slug, nombre o precio válidos). La categoría es opcional. */
export function mapProduct(id: string, data: Doc, toUrl: UrlBuilder): Product | null {
  const slug = str(data.slug);
  const name = str(data.name);
  const categoryId = str(data.categoryId);
  const price = int(data.price);
  if (!slug || !SLUG.test(slug) || !name || price === null || price < 1) return null;
  const discount = mapDiscount(data.discount);
  const unitsPerPack = int(data.unitsPerPack);
  return {
    sku: str(data.sku) ?? id,
    name,
    slug,
    description: str(data.description),
    shortDescription: str(data.shortDescription),
    categoryId: categoryId !== null && SLUG.test(categoryId) ? categoryId : null,
    images: mapImages(data.images, toUrl),
    price,
    discount,
    // Misma lógica que la tienda y el servidor (data-model 7.3); no se confía en el valor guardado.
    finalPrice: computeFinalPrice(price, discount),
    inStock: data.inStock === true,
    format: str(data.format),
    unitsPerPack,
    featured: data.featured === true,
    gtin: str(data.gtin),
    seo: mapSeo(data.seo),
  };
}

export function mapCategory(id: string, data: Doc): Category | null {
  const slug = str(data.slug) ?? id;
  const name = str(data.name);
  if (!name || !SLUG.test(slug) || data.published !== true) return null;
  return {
    slug,
    name,
    description: str(data.description),
    order: int(data.order) ?? 9999,
    seo: mapSeo(data.seo),
  };
}

export function mapSettings(data: Doc | undefined): PublicSettings {
  if (!data) return DEFAULT_SETTINGS;
  const communes = Array.isArray(data.communes)
    ? data.communes.flatMap((c) => {
        if (typeof c !== "object" || c === null) return [];
        const code = str((c as Doc).code);
        const name = str((c as Doc).name);
        return code && name ? [{ code, name }] : [];
      })
    : [];
  const pickup = typeof data.pickup === "object" && data.pickup !== null ? (data.pickup as Doc) : null;
  const threshold = int(data.freeShippingThreshold);
  return {
    shippingFee: int(data.shippingFee) ?? DEFAULT_SETTINGS.shippingFee,
    freeShippingThreshold: threshold !== null && threshold >= 1 ? threshold : null,
    communes: communes.length > 0 ? communes : DEFAULT_SETTINGS.communes,
    pickup: pickup
      ? {
          enabled: pickup.enabled === true,
          address: str(pickup.address) ?? "",
          hours: str(pickup.hours) ?? "",
        }
      : DEFAULT_SETTINGS.pickup,
    maxQtyPerItem: int(data.maxQtyPerItem) ?? DEFAULT_SETTINGS.maxQtyPerItem,
  };
}
