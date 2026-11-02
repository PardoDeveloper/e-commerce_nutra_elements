// Búsqueda de sugerencias del buscador de la cabecera (cliente). Sin tildes ni mayúsculas, como el catálogo.
import type { CategoryId, Clp } from "@/lib/data/types";

/** Entrada del índice que sirve /api/search-index: solo lo que muestra la sugerencia. */
export interface SearchEntry {
  sku: string;
  name: string;
  slug: string;
  categoryId: CategoryId | null;
  price: Clp;
  finalPrice: Clp;
  inStock: boolean;
  image: string | null;
}

export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Productos cuyo nombre contiene todos los términos. Orden: primero los que empiezan con la búsqueda,
 * luego los que tienen una palabra que empieza con algún término, y al final el resto; dentro de cada
 * grupo, los con stock antes y por nombre.
 */
export function searchProducts(entries: SearchEntry[], query: string, limit = 6): SearchEntry[] {
  const q = normalizeSearch(query);
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const scored: Array<{ entry: SearchEntry; score: number }> = [];
  for (const entry of entries) {
    const name = normalizeSearch(entry.name);
    if (!terms.every((t) => name.includes(t))) continue;
    const words = name.split(/[\s\-/]+/);
    const score = name.startsWith(q) ? 0 : terms.some((t) => words.some((w) => w.startsWith(t))) ? 1 : 2;
    scored.push({ entry, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(b.entry.inStock) - Number(a.entry.inStock) ||
      a.entry.name.localeCompare(b.entry.name, "es"),
  );
  return scored.slice(0, limit).map((s) => s.entry);
}
