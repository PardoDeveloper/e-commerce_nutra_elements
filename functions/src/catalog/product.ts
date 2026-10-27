import { computeFinalPrice, type ProductDiscount } from "../common/pricing.js";
import { MAX_PRICE, MAX_STOCK } from "./cells.js";
import type { ProductData } from "./types.js";
import { readCommissionPerUnit } from "../common/commission.js";

// Lectura defensiva de `products/{sku}`. Un documento dañado (precio no entero, stock negativo...)
// no se modifica en un lote: la fila sale inválida `INVALID_PRODUCT_DATA` y se revisa a mano.

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

function readDiscount(v: unknown): ProductDiscount | null | "corrupt" {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") return "corrupt";
  const d = v as { type?: unknown; value?: unknown };
  if ((d.type !== "percent" && d.type !== "fixed") || !isInt(d.value) || d.value < 0) return "corrupt";
  return { type: d.type, value: d.value };
}

function readImages(v: unknown): { path: string; alt: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { path: string; alt: string }[] = [];
  for (const item of v) {
    const i = item as { path?: unknown; alt?: unknown } | null;
    if (i && typeof i.path === "string" && typeof i.alt === "string") out.push({ path: i.path, alt: i.alt });
  }
  return out;
}

/** Convierte los datos crudos de un documento en `ProductData`, o `null` si están dañados. */
export function readProduct(sku: string, d: Record<string, unknown>): ProductData | null {
  const { price, stock } = d;
  if (!isInt(price) || price < 1 || price > MAX_PRICE) return null;
  if (!isInt(stock) || stock < 0 || stock > MAX_STOCK * 10) return null;
  const reserved = d["reserved"] === undefined ? 0 : d["reserved"];
  if (!isInt(reserved) || reserved < 0) return null;
  if (typeof d["active"] !== "boolean" || typeof d["published"] !== "boolean") return null;
  const discount = readDiscount(d["discount"]);
  if (discount === "corrupt") return null;
  let finalPrice: number;
  try {
    finalPrice = isInt(d["finalPrice"]) ? d["finalPrice"] : computeFinalPrice(price, discount);
  } catch {
    return null;
  }
  return {
    sku,
    sourceName: strOrNull(d["sourceName"]) ?? "",
    name: strOrNull(d["name"]) ?? "",
    slug: strOrNull(d["slug"]),
    description: strOrNull(d["description"]),
    categoryId: strOrNull(d["categoryId"]),
    images: readImages(d["images"]),
    price,
    discount,
    finalPrice,
    stock,
    reserved,
    inStock: d["inStock"] === true,
    active: d["active"],
    published: d["published"],
    hasPublishedAt: d["publishedAt"] !== null && d["publishedAt"] !== undefined,
    barcode: strOrNull(d["barcode"]),
    barcodeValid: d["barcodeValid"] === true,
    gtin: strOrNull(d["gtin"]),
    commissionPerUnit: readCommissionPerUnit(d["commissionPerUnit"]),
    deleted: d["deletedAt"] !== null && d["deletedAt"] !== undefined,
    deletedFieldsMissing: d["deletedAt"] === undefined,
  };
}

export type LoadedProduct =
  | { status: "missing" }
  | { status: "corrupt" }
  | { status: "ok"; product: ProductData };

/** Busca un SKU en el mapa de documentos crudos leídos. */
export function loadProduct(raw: ReadonlyMap<string, Record<string, unknown>>, sku: string): LoadedProduct {
  const data = raw.get(sku);
  if (!data) return { status: "missing" };
  const product = readProduct(sku, data);
  return product ? { status: "ok", product } : { status: "corrupt" };
}
