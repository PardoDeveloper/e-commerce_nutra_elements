// GET /api/search-index: índice liviano del catálogo para las sugerencias del buscador de la cabecera.
// Estático con ISR: se regenera cada 2 minutos y también cuando /api/revalidate toca rutas de /productos.
import { NextResponse } from "next/server";
import { getProducts } from "@/lib/data";
import type { SearchEntry } from "@/lib/search";

// Mismo respaldo que las páginas del catálogo (D-047).
export const revalidate = 120;

export async function GET(): Promise<NextResponse> {
  const products = await getProducts();
  const entries: SearchEntry[] = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    categoryId: p.categoryId,
    price: p.price,
    finalPrice: p.finalPrice,
    inStock: p.inStock,
    image: p.images[0]?.url ?? null,
  }));
  return NextResponse.json(entries);
}
