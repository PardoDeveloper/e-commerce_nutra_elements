import { computeFinalPrice, type ProductDiscount } from "../common/pricing.js";
import { sameDiscount, validateDiscount } from "./discount.js";
import { loadProduct } from "./product.js";
import { MSG, type ChunkPlan, type Item } from "./prepare.js";
import { Collector } from "./report.js";
import { updateOp, type ProductOp } from "./types.js";

// applyDiscount (functions.md 5.4): reemplaza el descuento (no se acumulan) y recalcula finalPrice.

export function planApplyDiscount(
  items: readonly Item<null>[],
  raw: ReadonlyMap<string, Record<string, unknown>>,
  discount: ProductDiscount | null,
): ChunkPlan {
  const c = new Collector();
  const ops: ProductOp[] = [];
  for (const { row, sku } of items) {
    const loaded = loadProduct(raw, sku);
    if (loaded.status === "missing") {
      c.reject(row, "SKU_NOT_FOUND", MSG.notFound, sku);
      continue;
    }
    if (loaded.status === "corrupt") {
      c.reject(row, "INVALID_PRODUCT_DATA", MSG.corrupt, sku);
      continue;
    }
    const product = loaded.product;
    if (product.deleted) {
      c.reject(row, "PRODUCT_DELETED", MSG.deleted, sku);
      continue;
    }
    if (discount) {
      const error = validateDiscount(product.price, discount);
      if (error === "DISCOUNT_TOO_HIGH") {
        c.reject(row, error, "El monto fijo debe ser menor que el precio del producto.", sku);
        continue;
      }
      if (error) {
        c.reject(row, error, "Descuento inválido (porcentaje entero de 1 a 99, o monto fijo entero).", sku);
        continue;
      }
    }
    if (sameDiscount(product.discount, discount)) {
      c.unchanged++;
      continue;
    }
    const finalPrice = computeFinalPrice(product.price, discount);
    c.changes.push({ row, sku, name: product.name, field: "discount", from: product.finalPrice, to: finalPrice });
    ops.push(updateOp(product, { discount, finalPrice }));
    c.updated++;
  }
  return { ops, collector: c };
}
