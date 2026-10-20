import type { BatchReport, ImportKind, ProductOp } from "./types.js";

// Puerto de almacenamiento del catálogo. Los planificadores son puros y solo hablan con este
// contrato; hay dos implementaciones: `firestore-store.ts` (Admin SDK) y `testing/memory-store.ts`
// (tests unitarios sin emulador, D-026).

/** Lecturas dentro de una transacción. Todas las lecturas van antes de `apply` (regla de Firestore). */
export interface CatalogReader {
  /** Documentos de `products` que existen, por SKU. Los inexistentes no aparecen en el mapa. */
  getProducts(skus: readonly string[]): Promise<Map<string, Record<string, unknown>>>;
  /** Documentos de `categories` que existen, por id. */
  getCategories(ids: readonly string[]): Promise<Map<string, Record<string, unknown>>>;
  /** Productos con ese `slug` (cualquier estado), para validar la unicidad al publicar. */
  findProductsBySlug(slug: string): Promise<{ sku: string; deleted: boolean }[]>;
}

export interface CatalogTx extends CatalogReader {
  /** Encola las escrituras; se confirman al terminar la transacción. Falla en modo solo lectura. */
  apply(ops: readonly ProductOp[], actor: { uid: string }): void;
}

/** Documento de `imports/{id}` (data-model.md 2.7). `createdAt` lo agrega el almacén con la hora del servidor. */
export interface ImportRecord {
  kind: ImportKind;
  dryRun: false;
  fileName: string | null;
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  corrected: BatchReport["corrected"];
  invalid: BatchReport["invalid"];
  warnings: BatchReport["warnings"];
  truncated: boolean;
  createdBy: string;
}

export interface CatalogStore {
  /** Ejecuta `fn` en una transacción (puede reintentarse: `fn` debe poder repetirse sin efectos). */
  runTransaction<T>(fn: (tx: CatalogTx) => Promise<T>, options?: { readOnly?: boolean }): Promise<T>;
  /** Guarda el registro de auditoría y devuelve su id. */
  saveImport(record: ImportRecord): Promise<string>;
}
