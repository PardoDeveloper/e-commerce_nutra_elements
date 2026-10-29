// Selección de «Productos destacados» del inicio. Lógica pura: la usan el home y el editor del admin.
import type { Product } from "@/lib/data/types";

/** Máximo de fichas destacadas en el inicio (contrato SEO 01-inicio: 8 a 12). */
export const FEATURED_LIMIT = 12;
/** Fichas automáticas cuando el admin aún no marca ninguno. */
const FALLBACK_LIMIT = 8;

/**
 * Los marcados como destacados por el admin, primero los que tienen stock y luego por el orden recibido.
 * Si no hay ninguno marcado, el primer producto con stock de cada categoría y luego completa hasta 8,
 * para que la sección nunca quede vacía.
 */
export function pickFeatured(products: Product[], categoryOrder: string[]): Product[] {
  const marked = products.filter((p) => p.featured);
  if (marked.length > 0) {
    return [...marked].sort((a, b) => Number(b.inStock) - Number(a.inStock)).slice(0, FEATURED_LIMIT);
  }
  const picked: Product[] = [];
  for (const cat of categoryOrder) {
    const first = products.find((p) => p.categoryId === cat && p.inStock);
    if (first) picked.push(first);
  }
  for (const p of products) {
    if (picked.length >= FALLBACK_LIMIT) break;
    if (p.inStock && !picked.includes(p)) picked.push(p);
  }
  return picked.slice(0, FALLBACK_LIMIT);
}
