// Cálculo del resumen del pedido (subtotal, descuentos, envío y total). Lógica pura.
// SOLO PARA MOSTRAR en el prototipo: en producción el total lo calcula y confirma el
// servidor (D-005). Replica las reglas de functions/src/common/pricing.ts:
//   - subtotal = Σ precio final × cantidad (ya con descuentos);
//   - envío gratis si subtotal >= umbral; un umbral inválido (null, 0, negativo, decimal) se
//     ignora, es decir, no hay envío gratis (D-027);
//   - retiro en tienda: envío 0.

import type { CategoryId, Product } from "@/lib/data/types";

/** Lo mínimo de un producto que necesita el carrito y el checkout (llega desde el servidor). */
export interface CatalogEntry {
  sku: string;
  name: string;
  slug: string;
  categoryId: CategoryId;
  price: number;
  finalPrice: number;
  inStock: boolean;
  /** URL de la primera foto real del producto, si tiene (se muestra en el carrito). */
  imageUrl?: string | null;
}

export function toCatalogEntry(p: Product): CatalogEntry {
  return {
    sku: p.sku,
    name: p.name,
    slug: p.slug,
    // Solo elige el color del marcador de imagen; "" = sin categoría (D-040).
    categoryId: p.categoryId ?? "",
    price: p.price,
    finalPrice: p.finalPrice,
    inStock: p.inStock,
    imageUrl: p.images[0]?.url || null,
  };
}

export type DeliveryType = "shipping" | "pickup";

export interface SummaryInput {
  items: readonly { sku: string; qty: number }[];
  catalog: Readonly<Record<string, CatalogEntry>>;
  settings: { shippingFee: number; freeShippingThreshold: number | null };
  /** null = aún no se elige (carrito): el envío no se calcula. */
  delivery: DeliveryType | null;
}

export interface SummaryLine {
  sku: string;
  name: string;
  slug: string;
  categoryId: CategoryId;
  unitPrice: number;
  unitFinalPrice: number;
  qty: number;
  lineTotal: number;
  inStock: boolean;
}

export interface Summary {
  lines: SummaryLine[];
  /** SKU del carrito que ya no existen en el catálogo (se excluyen del cálculo). */
  missingSkus: string[];
  /** Σ precio de lista × cantidad. */
  listSubtotal: number;
  /** Σ (lista - final) × cantidad. Siempre `listSubtotal - subtotal`. */
  discountTotal: number;
  subtotal: number;
  shipping: number;
  total: number;
  freeShippingApplied: boolean;
  /** Umbral efectivo (null si no hay envío gratis). */
  threshold: number | null;
  /** Cuánto falta para el envío gratis; null si no aplica o ya se alcanzó. */
  missingForFreeShipping: number | null;
}

export function effectiveThreshold(value: number | null): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

export function computeSummary(input: SummaryInput): Summary {
  const lines: SummaryLine[] = [];
  const missingSkus: string[] = [];
  for (const item of input.items) {
    const entry = input.catalog[item.sku];
    if (!entry) {
      missingSkus.push(item.sku);
      continue;
    }
    lines.push({
      sku: entry.sku,
      name: entry.name,
      slug: entry.slug,
      categoryId: entry.categoryId,
      unitPrice: entry.price,
      unitFinalPrice: entry.finalPrice,
      qty: item.qty,
      lineTotal: entry.finalPrice * item.qty,
      inStock: entry.inStock,
    });
  }

  const listSubtotal = lines.reduce((acc, l) => acc + l.unitPrice * l.qty, 0);
  const subtotal = lines.reduce((acc, l) => acc + l.lineTotal, 0);
  const threshold = effectiveThreshold(input.settings.freeShippingThreshold);
  const reached = threshold !== null && subtotal >= threshold;

  let shipping = 0;
  let freeShippingApplied = false;
  if (input.delivery === "shipping") {
    if (reached) freeShippingApplied = true;
    else shipping = input.settings.shippingFee;
  }

  return {
    lines,
    missingSkus,
    listSubtotal,
    discountTotal: listSubtotal - subtotal,
    subtotal,
    shipping,
    total: subtotal + shipping,
    freeShippingApplied,
    threshold,
    missingForFreeShipping: threshold !== null && !reached && subtotal > 0 ? threshold - subtotal : null,
  };
}
