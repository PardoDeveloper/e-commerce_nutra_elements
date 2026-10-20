import { normalizeSku, type Cell } from "./cells.js";
import { Collector } from "./report.js";
import type { ProductOp } from "./types.js";

// Paso previo de los lotes: identifica cada fila por SKU y detecta los SKU inválidos y repetidos de
// TODO el archivo (antes de partirlo en transacciones). Lógica pura.

/** Una fila lista para planificar: `row` es el número de fila de la hoja (1 = encabezado). */
export interface Item<T> {
  row: number;
  sku: string;
  input: T;
}

/** Resultado de planificar un trozo del lote. `commit` se llama cuando la transacción se confirma. */
export interface ChunkPlan {
  ops: ProductOp[];
  collector: Collector;
  commit?: () => void;
}

export const MSG = {
  invalidSku: "SKU vacío o con formato inválido.",
  duplicateSku: "SKU repetido en el archivo.",
  notFound: "El SKU no existe en el catálogo.",
  deleted: "El producto está eliminado: restáuralo antes de modificarlo. No se cambió nada.",
  corrupt: "Los datos del producto están dañados: revísalo antes de modificarlo. No se cambió nada.",
  invalidPrice: "El precio debe ser un entero entre 1 y 10.000.000 (CLP).",
} as const;

/** Número de fila de la hoja: 1 es el encabezado, así que la primera fila de datos es la 2. */
export const sheetRow = (index: number): number => index + 2;

/**
 * Filas de una hoja. Las que no tienen un SKU válido, o lo repiten, se rechazan en `collector`
 * (`INVALID_SKU`, `DUPLICATE_SKU`: la segunda aparición es la inválida).
 */
export function prepareRows<T>(rows: readonly T[], skuCell: (row: T) => Cell | undefined, collector: Collector): Item<T>[] {
  const seen = new Set<string>();
  const items: Item<T>[] = [];
  rows.forEach((input, i) => {
    const row = sheetRow(i);
    const sku = normalizeSku(skuCell(input));
    if (sku === null) {
      collector.reject(row, "INVALID_SKU", MSG.invalidSku);
      return;
    }
    if (seen.has(sku)) {
      collector.reject(row, "DUPLICATE_SKU", MSG.duplicateSku, sku);
      return;
    }
    seen.add(sku);
    items.push({ row, sku, input });
  });
  return items;
}

/** Lista de SKU (selección múltiple). `row` es la posición en la lista, desde 1. */
export function prepareSkus(skus: readonly string[], collector: Collector): Item<null>[] {
  const seen = new Set<string>();
  const items: Item<null>[] = [];
  skus.forEach((raw, i) => {
    const row = i + 1;
    const sku = normalizeSku(raw);
    if (sku === null) {
      collector.reject(row, "INVALID_SKU", "SKU con formato inválido.");
      return;
    }
    if (seen.has(sku)) {
      collector.reject(row, "DUPLICATE_SKU", "SKU repetido en la lista.", sku);
      return;
    }
    seen.add(sku);
    items.push({ row, sku, input: null });
  });
  return items;
}

export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
