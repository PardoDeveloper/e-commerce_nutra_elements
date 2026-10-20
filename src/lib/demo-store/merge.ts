// Mezcla de los cambios guardados con el catálogo base (D-030). Funciones puras, sin disco.
import { computeFinalPrice } from "@/lib/admin/pricing";
import type { AdminProduct } from "@/lib/admin/types";
import type { Product } from "@/lib/data/types";
import { demoImageUrlFromPath } from "./config";
import type { StoredProduct, StoredProductInput } from "./types";

/** ¿Se muestra en la tienda? (D-029: un producto eliminado nunca; además debe estar publicado y activo). */
export function isVisible(s: StoredProduct): boolean {
  return s.deletedAt === null && s.published && s.active && s.slug !== null && s.categoryId !== null;
}

/**
 * Producto público a partir del base y lo guardado. Devuelve null si no debe verse
 * (eliminado, despublicado, inactivo): la ficha da 404 y no aparece en listados.
 */
export function mergeStoredIntoProduct(base: Product, s: StoredProduct): Product | null {
  if (!isVisible(s) || s.slug === null || s.categoryId === null) return null;
  return {
    ...base,
    name: s.name,
    slug: s.slug,
    description: s.description,
    shortDescription: s.shortDescription ?? `${s.name}. Suplemento alimentario en cápsulas.`,
    categoryId: s.categoryId,
    images: s.images.map((i) => {
      const url = demoImageUrlFromPath(i.path);
      return url ? { path: i.path, alt: i.alt, url } : { path: i.path, alt: i.alt };
    }),
    price: s.price,
    discount: s.discount,
    finalPrice: computeFinalPrice(s.price, s.discount),
    inStock: s.stock > 0,
    format: s.format,
    unitsPerPack: s.unitsPerPack,
    family: s.family,
    seo: s.seo,
  };
}

/** Estado del admin: el producto base con lo guardado encima (incluye eliminados y borradores). */
export function applyStoredToAdmin(base: AdminProduct, s: StoredProduct): AdminProduct {
  return {
    ...base,
    name: s.name,
    slug: s.slug,
    description: s.description,
    shortDescription: s.shortDescription,
    categoryId: s.categoryId,
    // `previewUrl` (solo demo) permite ver la imagen guardada en el editor tras recargar.
    images: s.images.map((i) => {
      const url = demoImageUrlFromPath(i.path);
      return url ? { path: i.path, alt: i.alt, previewUrl: url } : { path: i.path, alt: i.alt };
    }),
    price: s.price,
    discount: s.discount,
    finalPrice: computeFinalPrice(s.price, s.discount),
    stock: s.stock,
    inStock: s.stock > 0,
    active: s.active,
    published: s.published,
    format: s.format,
    unitsPerPack: s.unitsPerPack,
    family: s.family,
    seo: s.seo,
    deletedAt: s.deletedAt,
    deletedBy: s.deletedBy,
  };
}

/** Campos que se guardan de un producto del admin (sin `sku`). */
export function toStoredProduct(p: AdminProduct): StoredProduct {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description,
    shortDescription: p.shortDescription,
    categoryId: p.categoryId,
    images: p.images.map((i) => ({ path: i.path, alt: i.alt })),
    price: p.price,
    discount: p.discount,
    stock: p.stock,
    active: p.active,
    published: p.published,
    format: p.format,
    unitsPerPack: p.unitsPerPack,
    family: p.family,
    seo: p.seo,
    deletedAt: p.deletedAt,
    deletedBy: p.deletedBy,
  };
}

export function toStoredInput(p: AdminProduct): StoredProductInput {
  return { sku: p.sku, ...toStoredProduct(p) };
}
