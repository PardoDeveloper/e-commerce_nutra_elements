import { MSG, type ChunkPlan, type Item } from "./prepare.js";
import { Collector } from "./report.js";
import { updateOp, type ProductOp } from "./types.js";

// deleteProducts y restoreProducts (functions.md 5.9, D-029). El estado actual del documento decide:
// repetir la operación no escribe nada (no se pisan `deletedAt` ni `deletedBy` originales).
// Solo se lee `deletedAt`: eliminar o restaurar no depende del precio ni del stock, así que también
// funciona con un documento cuyos otros campos estén dañados.

type RawProducts = ReadonlyMap<string, Record<string, unknown>>;

function plan(items: readonly Item<null>[], raw: RawProducts, mode: "delete" | "restore"): ChunkPlan {
  const c = new Collector();
  const ops: ProductOp[] = [];
  for (const { row, sku } of items) {
    const data = raw.get(sku);
    if (!data) {
      c.reject(row, "SKU_NOT_FOUND", MSG.notFound, sku);
      continue;
    }
    const deleted = data["deletedAt"] !== null && data["deletedAt"] !== undefined;
    if (mode === "delete" && deleted) {
      c.reject(row, "ALREADY_DELETED", "El producto ya estaba eliminado. No se cambió nada.", sku);
      continue;
    }
    if (mode === "restore" && !deleted) {
      c.reject(row, "NOT_DELETED", "El producto no está eliminado. No se cambió nada.", sku);
      continue;
    }
    ops.push(updateOp({ sku, deletedFieldsMissing: data["deletedAt"] === undefined }, {}, { deletion: mode }));
    c.updated++;
  }
  return { ops, collector: c };
}

export const planDelete = (items: readonly Item<null>[], raw: RawProducts): ChunkPlan => plan(items, raw, "delete");
export const planRestore = (items: readonly Item<null>[], raw: RawProducts): ChunkPlan => plan(items, raw, "restore");
