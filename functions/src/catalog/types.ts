import type { ProductDiscount } from "../common/pricing.js";
import type { Cell } from "./cells.js";

export type { Cell, ProductDiscount };

// Tipos del contrato functions.md 5 (reporte de lotes) y de las operaciones que producen los
// planificadores puros. Los planificadores NO escriben: devuelven `ProductOp[]` y el almacén
// (Firestore real o el de memoria de los tests) las aplica dentro de la transacción.

export type ImportKind = "catalog" | "price" | "stock" | "discount" | "publish" | "delete" | "restore" | "create" | "update";

export interface InvalidRow {
  row: number;
  sku?: string;
  code: string;
  message: string;
}
export interface CorrectedCell {
  row: number;
  sku: string;
  field: string;
  from: Cell;
  to: Cell;
}
export interface Warning {
  sku?: string;
  code: string;
  message: string;
}
/** Cambio previsto de una fila válida (vista previa). Extensión aditiva del contrato; no se guarda en `imports`. */
export interface PlannedChange {
  row: number;
  sku: string;
  name: string;
  field: "price" | "stock" | "discount" | "create";
  from: Cell;
  to: Cell;
}

export interface BatchReport {
  importId: string | null;
  dryRun: boolean;
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  corrected: CorrectedCell[];
  invalid: InvalidRow[];
  warnings: Warning[];
  truncated: boolean;
  /** Extensión aditiva: detalle de cambios para la vista previa (≤ 500). */
  changes: PlannedChange[];
}

export interface BatchOptions {
  dryRun?: boolean | undefined;
  fileName?: string | undefined;
}

/** Producto leído de Firestore y validado (ver `product.ts`). Solo los campos que usan los lotes. */
export interface ProductData {
  sku: string;
  sourceName: string;
  name: string;
  slug: string | null;
  description: string | null;
  categoryId: string | null;
  images: { path: string; alt: string }[];
  price: number;
  discount: ProductDiscount | null;
  finalPrice: number;
  stock: number;
  reserved: number;
  inStock: boolean;
  active: boolean;
  published: boolean;
  /** Ya tiene `publishedAt` (la primera publicación lo fija una sola vez). */
  hasPublishedAt: boolean;
  barcode: string | null;
  barcodeValid: boolean;
  gtin: string | null;
  /** `deletedAt != null` (eliminación lógica, D-029). */
  deleted: boolean;
  /** El documento no trae `deletedAt` (dato antiguo): se completa con `null` al escribirlo. */
  deletedFieldsMissing: boolean;
}

/** Cambios de campos que un lote puede hacer en un producto existente. */
export interface ProductPatch {
  price?: number;
  finalPrice?: number;
  discount?: ProductDiscount | null;
  stock?: number;
  inStock?: boolean;
  active?: boolean;
  published?: boolean;
  sourceName?: string;
  barcode?: string | null;
  barcodeValid?: boolean;
  gtin?: string | null;
}

export interface NewProductFields {
  sku: string;
  sourceName: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  barcode: string | null;
  barcodeValid: boolean;
  gtin: string | null;
  unitsPerPack: number | null;
  format: string | null;
  family: string | null;
  source: "controlfarma-xls" | "manual";
}

export interface CreateOp {
  type: "create";
  sku: string;
  fields: NewProductFields;
  /** Fija `importedAt` (importCatalog). */
  imported: boolean;
}

export interface UpdateOp {
  type: "update";
  sku: string;
  patch: ProductPatch;
  /** Fija `importedAt` (importCatalog). */
  imported: boolean;
  /** Primera publicación: fija `publishedAt`. */
  setPublishedAt: boolean;
  /** `delete`: deletedAt/deletedBy y published=false. `restore`: deletedAt/deletedBy a null y published=false. */
  deletion: "delete" | "restore" | null;
  /** Dato antiguo sin `deletedAt`: se escribe `deletedAt: null, deletedBy: null`. */
  healDeletedFields: boolean;
}

export type ProductOp = CreateOp | UpdateOp;

/** Crea una operación de actualización con los valores por defecto. */
export function updateOp(product: Pick<ProductData, "sku" | "deletedFieldsMissing">, patch: ProductPatch, extra: Partial<Pick<UpdateOp, "imported" | "setPublishedAt" | "deletion">> = {}): UpdateOp {
  return {
    type: "update",
    sku: product.sku,
    patch,
    imported: extra.imported ?? false,
    setPublishedAt: extra.setPublishedAt ?? false,
    deletion: extra.deletion ?? null,
    healDeletedFields: product.deletedFieldsMissing,
  };
}
