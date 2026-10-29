// Selección de «Productos destacados» del inicio. Lógica pura: la usan el home y el editor del admin.
import type { Product } from "@/lib/data/types";

/** Máximo de fichas destacadas en el inicio (contrato SEO 01-inicio: 8 a 12). */
export const FEATURED_LIMIT = 12;

/**
 * Solo los marcados como destacados por el admin, primero los que tienen stock y luego por el orden recibido.
 * Sin marcados devuelve una lista vacía y el inicio oculta la sección (D-045).
 */
export function pickFeatured(products: Product[]): Product[] {
  return products
    .filter((p) => p.featured)
    .sort((a, b) => Number(b.inStock) - Number(a.inStock))
    .slice(0, FEATURED_LIMIT);
}
