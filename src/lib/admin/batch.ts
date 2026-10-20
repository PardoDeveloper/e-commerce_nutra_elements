// Validación y plan de los lotes (functions.md 5): importCatalog, importPrices, importStock y
// applyDiscount. Lógica pura que replica las reglas del servidor para la vista previa (dryRun).
// En producción el servidor sigue siendo la autoridad; esto solo calca el contrato.
import { AdminServiceError } from "./errors";
import { computeFinalPrice, validateDiscount } from "./pricing";
import type {
  AdminProduct,
  BatchOptions,
  BatchReport,
  Cell,
  CatalogRow,
  CorrectedCell,
  InvalidRow,
  PlannedChange,
  PriceRow,
  ProductDiscount,
  StockRow,
  Warning,
} from "./types";

export const MAX_BATCH_ROWS = 1000;
export const MAX_LIST = 500;
/** Máximo de productos por operación de eliminar o restaurar (D-029). */
export const MAX_DELETE_SKUS = 200;
export const SKU_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_PRICE = 10_000_000;
const MAX_STOCK = 1_000_000;

// ---------- Celdas ----------

export function isEmptyCell(cell: Cell | undefined): boolean {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

/** SKU como texto: `2427844` y `"2427844.0"` dan `"2427844"`; decimales reales o caracteres raros, null. */
export function normalizeSku(cell: Cell | undefined): string | null {
  if (cell === null || cell === undefined) return null;
  let text: string;
  if (typeof cell === "number") {
    if (!Number.isFinite(cell) || !Number.isInteger(cell)) return null;
    text = String(cell);
  } else {
    text = cell.trim().replace(/^(\d+)\.0+$/, "$1");
  }
  return SKU_PATTERN.test(text) ? text : null;
}

export type NumberParse = { ok: true; value: number } | { ok: false };

/** Entero CLP; acepta "12.990" y "$12.990". Decimales distintos de cero son inválidos. */
export function parsePrice(cell: Cell | undefined): NumberParse {
  const value = parseIntegerCell(cell, true);
  if (!value.ok || value.value < 1 || value.value > MAX_PRICE) return { ok: false };
  return value;
}

function parseIntegerCell(cell: Cell | undefined, allowThousands: boolean): NumberParse {
  if (typeof cell === "number") {
    return Number.isFinite(cell) && Number.isInteger(cell) ? { ok: true, value: cell } : { ok: false };
  }
  if (typeof cell !== "string") return { ok: false };
  let text = cell.trim().replace(/^\$\s*/, "");
  if (allowThousands && /^-?\d{1,3}(\.\d{3})+(,0+)?$/.test(text)) text = text.replace(/\./g, "");
  text = text.replace(/[.,]0+$/, "");
  if (!/^-?\d+$/.test(text)) return { ok: false };
  return { ok: true, value: Number(text) };
}

export type StockParse =
  | { kind: "ok"; value: number }
  | { kind: "corrected"; value: 0; from: Cell }
  | { kind: "empty" }
  | { kind: "invalid" };

/** STOCK físico. Vacío = `empty`; texto no numérico = `invalid`; negativo se corrige a 0. */
export function parseStock(cell: Cell | undefined): StockParse {
  if (isEmptyCell(cell)) return { kind: "empty" };
  const parsed = parseIntegerCell(cell, false);
  if (!parsed.ok) return { kind: "invalid" };
  if (parsed.value < 0) return { kind: "corrected", value: 0, from: cell ?? null };
  if (parsed.value > MAX_STOCK) return { kind: "invalid" };
  return { kind: "ok", value: parsed.value };
}

// ---------- Operaciones a aplicar ----------

export type BatchOp =
  | { type: "update"; sku: string; price?: number; stock?: number; active?: boolean; removeDiscount?: boolean }
  | {
      type: "create";
      sku: string;
      sourceName: string;
      name: string;
      price: number;
      stock: number;
      active: boolean;
      barcode: string | null;
    }
  | { type: "discount"; sku: string; discount: ProductDiscount | null };

export interface BatchPlan {
  report: BatchReport;
  ops: BatchOp[];
}

type ProductMap = ReadonlyMap<string, AdminProduct>;

interface Collector {
  corrected: CorrectedCell[];
  invalid: InvalidRow[];
  warnings: Warning[];
  changes: PlannedChange[];
  ops: BatchOp[];
  created: number;
  updated: number;
  unchanged: number;
}

function newCollector(): Collector {
  return { corrected: [], invalid: [], warnings: [], changes: [], ops: [], created: 0, updated: 0, unchanged: 0 };
}

function finish(c: Collector, rowsCount: number, options: BatchOptions): BatchPlan {
  const truncated = [c.corrected, c.invalid, c.warnings, c.changes].some((l) => l.length > MAX_LIST);
  return {
    ops: c.ops,
    report: {
      importId: options.dryRun ? null : `demo-${rowsCount}`,
      dryRun: options.dryRun ?? false,
      rows: rowsCount,
      created: c.created,
      updated: c.updated,
      unchanged: c.unchanged,
      skipped: c.invalid.length,
      corrected: c.corrected.slice(0, MAX_LIST),
      invalid: c.invalid.slice(0, MAX_LIST),
      warnings: c.warnings.slice(0, MAX_LIST),
      truncated,
      changes: c.changes.slice(0, MAX_LIST),
    },
  };
}

function batchError(rows: unknown[]): "EMPTY_BATCH" | "TOO_MANY_ROWS" | null {
  if (rows.length === 0) return "EMPTY_BATCH";
  if (rows.length > MAX_BATCH_ROWS) return "TOO_MANY_ROWS";
  return null;
}

function assertBatch(rows: unknown[]): void {
  const code = batchError(rows);
  if (code === "EMPTY_BATCH") throw new AdminServiceError(code, "El archivo no tiene filas.");
  if (code === "TOO_MANY_ROWS") throw new AdminServiceError(code, `Máximo ${MAX_BATCH_ROWS} filas por lote.`);
}

/** Fila inválida de un SKU eliminado (D-029): no se revive ni se cambia. */
function deletedRow(row: number, sku: string): InvalidRow {
  return { row, sku, code: "PRODUCT_DELETED", message: "El producto está eliminado: restáuralo antes de modificarlo. No se cambió nada." };
}

/** Número de fila de la hoja: 1 es el encabezado, así que la primera fila de datos es la 2. */
const sheetRow = (index: number) => index + 2;

/** Aplica un nuevo precio a un producto existente; informa DISCOUNT_REMOVED si un descuento fijo deja de ser válido. */
function planPrice(c: Collector, p: AdminProduct, row: number, newPrice: number): boolean {
  if (p.price === newPrice) return false;
  c.changes.push({ row, sku: p.sku, name: p.name, field: "price", from: p.price, to: newPrice });
  const removeDiscount = p.discount !== null && validateDiscount(newPrice, p.discount) !== null;
  if (removeDiscount) {
    c.warnings.push({ sku: p.sku, code: "DISCOUNT_REMOVED", message: "El descuento fijo dejó de ser válido con el precio nuevo y se eliminó." });
  }
  c.ops.push({ type: "update", sku: p.sku, price: newPrice, removeDiscount });
  return true;
}

// ---------- importPrices ----------

export function planImportPrices(rows: PriceRow[], products: ProductMap, options: BatchOptions = {}): BatchPlan {
  assertBatch(rows);
  const c = newCollector();
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const row = sheetRow(i);
    const sku = normalizeSku(r.SKU);
    if (!sku) return void c.invalid.push({ row, code: "INVALID_SKU", message: "SKU vacío o con formato inválido." });
    if (seen.has(sku)) return void c.invalid.push({ row, sku, code: "DUPLICATE_SKU", message: "SKU repetido en el archivo." });
    seen.add(sku);
    const product = products.get(sku);
    if (!product) return void c.invalid.push({ row, sku, code: "SKU_NOT_FOUND", message: "El SKU no existe en el catálogo." });
    if (product.deletedAt) return void c.invalid.push(deletedRow(row, sku));
    const price = parsePrice(r.PRECIO);
    if (!price.ok) {
      return void c.invalid.push({ row, sku, code: "INVALID_PRICE", message: "El precio debe ser un entero entre 1 y 10.000.000 (CLP)." });
    }
    if (planPrice(c, product, row, price.value)) c.updated++;
    else c.unchanged++;
  });
  return finish(c, rows.length, options);
}

// ---------- importStock ----------

export function planImportStock(rows: StockRow[], products: ProductMap, options: BatchOptions = {}): BatchPlan {
  assertBatch(rows);
  const c = newCollector();
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const row = sheetRow(i);
    const sku = normalizeSku(r.SKU);
    if (!sku) return void c.invalid.push({ row, code: "INVALID_SKU", message: "SKU vacío o con formato inválido." });
    if (seen.has(sku)) return void c.invalid.push({ row, sku, code: "DUPLICATE_SKU", message: "SKU repetido en el archivo." });
    seen.add(sku);
    const product = products.get(sku);
    if (!product) return void c.invalid.push({ row, sku, code: "SKU_NOT_FOUND", message: "El SKU no existe en el catálogo." });
    if (product.deletedAt) return void c.invalid.push(deletedRow(row, sku));
    const stock = parseStock(r.STOCK);
    if (stock.kind === "empty") {
      return void c.invalid.push({ row, sku, code: "EMPTY_STOCK", message: "Stock vacío: no se toca el producto (una celda en blanco no debe dejarlo sin stock)." });
    }
    if (stock.kind === "invalid") {
      return void c.invalid.push({ row, sku, code: "INVALID_STOCK", message: "El stock debe ser un entero entre 0 y 1.000.000." });
    }
    if (stock.kind === "corrected") {
      c.corrected.push({ row, sku, field: "stock", from: stock.from, to: 0 });
    }
    // STOCK es el físico: lo disponible descuenta lo reservado.
    const available = Math.max(0, stock.value - product.reserved);
    if (available === product.stock) return void c.unchanged++;
    c.changes.push({ row, sku, name: product.name, field: "stock", from: product.stock, to: available });
    c.ops.push({ type: "update", sku, stock: available });
    c.updated++;
  });
  return finish(c, rows.length, options);
}

// ---------- importCatalog ----------

const LAB = "NUTRA ELEMENTS";

export function planImportCatalog(rows: CatalogRow[], products: ProductMap, options: BatchOptions = {}): BatchPlan {
  assertBatch(rows);
  const c = newCollector();
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const row = sheetRow(i);
    const sku = normalizeSku(r.ID);
    if (!sku) return void c.invalid.push({ row, code: "INVALID_SKU", message: "ID (SKU) vacío o con formato inválido." });
    if (seen.has(sku)) return void c.invalid.push({ row, sku, code: "DUPLICATE_SKU", message: "SKU repetido en el archivo." });
    seen.add(sku);
    // Un SKU eliminado no se revive ni se modifica con la planilla (D-029).
    if (products.get(sku)?.deletedAt) return void c.invalid.push(deletedRow(row, sku));
    const name = typeof r.NOMBRE === "string" ? r.NOMBRE.trim() : "";
    if (name.length < 1 || name.length > 200) {
      return void c.invalid.push({ row, sku, code: "INVALID_NAME", message: "NOMBRE vacío o de más de 200 caracteres." });
    }
    const price = parsePrice(r.PRECIO_VENTA_PUBLICO);
    if (!price.ok) {
      return void c.invalid.push({ row, sku, code: "INVALID_PRICE", message: "El precio debe ser un entero entre 1 y 10.000.000 (CLP)." });
    }
    const activeText = typeof r.ACTIVO === "string" ? r.ACTIVO.trim().toUpperCase() : "";
    if (activeText !== "SI" && activeText !== "NO") {
      return void c.invalid.push({ row, sku, code: "INVALID_ACTIVE", message: 'ACTIVO debe ser "SI" o "NO".' });
    }
    const active = activeText === "SI";
    const product = products.get(sku);
    const stock = parseStock(r.STOCK_ACTUAL);
    if (stock.kind === "invalid") {
      return void c.invalid.push({ row, sku, code: "INVALID_STOCK", message: "STOCK_ACTUAL debe ser un entero entre 0 y 1.000.000." });
    }
    if (product && stock.kind === "empty") {
      return void c.invalid.push({ row, sku, code: "EMPTY_STOCK", message: "Stock vacío en un producto existente: no se toca el producto." });
    }
    if (typeof r.LABORATORIO === "string" && r.LABORATORIO.trim().toUpperCase() !== LAB) {
      c.warnings.push({ sku, code: "LABORATORY_MISMATCH", message: `LABORATORIO distinto de "${LAB}".` });
    }

    if (!product) {
      // Importación inicial: stock vacío o negativo pasa a 0 y se informa (D-018).
      let initial = 0;
      if (stock.kind === "ok") initial = stock.value;
      else if (stock.kind === "empty") c.corrected.push({ row, sku, field: "stock", from: null, to: 0 });
      else if (stock.kind === "corrected") c.corrected.push({ row, sku, field: "stock", from: stock.from, to: 0 });
      c.changes.push({ row, sku, name, field: "create", from: null, to: price.value });
      c.ops.push({
        type: "create",
        sku,
        sourceName: name,
        name,
        price: price.value,
        stock: initial,
        active,
        barcode: isEmptyCell(r.CODIGO_BARRA) ? null : String(r.CODIGO_BARRA),
      });
      c.created++;
      return;
    }

    // Reimportación: pisa precio y stock; nunca toca el contenido ni los descuentos.
    let changed = planPrice(c, product, row, price.value);
    let newStock = product.stock;
    if (stock.kind === "ok" || stock.kind === "corrected") {
      if (stock.kind === "corrected") c.corrected.push({ row, sku, field: "stock", from: stock.from, to: 0 });
      newStock = Math.max(0, stock.value - product.reserved);
    }
    if (newStock !== product.stock) {
      c.changes.push({ row, sku, name: product.name, field: "stock", from: product.stock, to: newStock });
      c.ops.push({ type: "update", sku, stock: newStock });
      changed = true;
    }
    if (active !== product.active) {
      c.ops.push({ type: "update", sku, active });
      changed = true;
    }
    if (changed) c.updated++;
    else c.unchanged++;
  });
  return finish(c, rows.length, options);
}

// ---------- applyDiscount ----------

export const MAX_DISCOUNT_SKUS = 150;

export function planApplyDiscount(
  skus: string[],
  discount: ProductDiscount | null,
  products: ProductMap,
  options: BatchOptions = {},
): BatchPlan {
  if (skus.length === 0) throw new AdminServiceError("EMPTY_BATCH", "Elige al menos un producto.");
  if (skus.length > MAX_DISCOUNT_SKUS) throw new AdminServiceError("TOO_MANY_ROWS", `Máximo ${MAX_DISCOUNT_SKUS} productos por operación.`);
  const c = newCollector();
  const seen = new Set<string>();
  skus.forEach((raw, i) => {
    const row = i + 1;
    const sku = normalizeSku(raw);
    if (!sku) return void c.invalid.push({ row, code: "INVALID_SKU", message: "SKU con formato inválido." });
    if (seen.has(sku)) return void c.invalid.push({ row, sku, code: "DUPLICATE_SKU", message: "SKU repetido en la lista." });
    seen.add(sku);
    const product = products.get(sku);
    if (!product) return void c.invalid.push({ row, sku, code: "SKU_NOT_FOUND", message: "El SKU no existe en el catálogo." });
    if (product.deletedAt) return void c.invalid.push(deletedRow(row, sku));
    if (discount) {
      const error = validateDiscount(product.price, discount);
      if (error === "DISCOUNT_TOO_HIGH") {
        return void c.invalid.push({ row, sku, code: error, message: "El monto fijo debe ser menor que el precio del producto." });
      }
      if (error) return void c.invalid.push({ row, sku, code: error, message: "Descuento inválido (porcentaje entero de 1 a 99, o monto fijo entero)." });
    }
    const newFinal = computeFinalPrice(product.price, discount);
    const same =
      (product.discount === null && discount === null) ||
      (product.discount !== null && discount !== null && product.discount.type === discount.type && product.discount.value === discount.value);
    if (same) return void c.unchanged++;
    c.changes.push({ row, sku, name: product.name, field: "discount", from: product.finalPrice, to: newFinal });
    c.ops.push({ type: "discount", sku, discount });
    c.updated++;
  });
  return finish(c, skus.length, options);
}

// ---------- Hoja de cálculo -> filas crudas ----------

export type SheetKind = "catalog" | "prices" | "stock";

export const SHEET_COLUMNS: Record<SheetKind, readonly string[]> = {
  catalog: ["ID", "NOMBRE", "CODIGO_BARRA", "STOCK_ACTUAL", "PRECIO_VENTA_PUBLICO", "ACTIVO", "LABORATORIO"],
  prices: ["SKU", "PRECIO"],
  stock: ["SKU", "STOCK"],
};

/** Columnas sin las que no se puede procesar (el resto del catálogo es opcional en el archivo). */
const REQUIRED_COLUMNS: Record<SheetKind, readonly string[]> = {
  catalog: ["ID", "NOMBRE", "PRECIO_VENTA_PUBLICO", "ACTIVO"],
  prices: ["SKU", "PRECIO"],
  stock: ["SKU", "STOCK"],
};

export type ExtractResult =
  | { ok: true; rows: Record<string, Cell>[] }
  | { ok: false; missing: string[] };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();

/**
 * Convierte la matriz de la hoja (primera fila = encabezados) en filas por columna. Las columnas
 * se buscan sin distinguir mayúsculas ni tildes. Si falta una obligatoria, se informa antes de llamar.
 */
export function extractRows(matrix: unknown[][], kind: SheetKind): ExtractResult {
  const header = (matrix[0] ?? []).map((h) => (typeof h === "string" || typeof h === "number" ? norm(String(h)) : ""));
  const missing = REQUIRED_COLUMNS[kind].filter((col) => !header.includes(col));
  if (missing.length > 0) return { ok: false, missing };
  const rows: Record<string, Cell>[] = [];
  for (const line of matrix.slice(1)) {
    const record: Record<string, Cell> = {};
    for (const col of SHEET_COLUMNS[kind]) {
      const idx = header.indexOf(col);
      const value = idx >= 0 ? line[idx] : null;
      record[col] = typeof value === "number" || typeof value === "string" ? value : null;
    }
    rows.push(record);
  }
  // Se quitan solo las filas vacías del final: las del medio se informan, para no desplazar los números de fila.
  while (rows.length > 0 && Object.values(rows[rows.length - 1]!).every(isEmptyCell)) rows.pop();
  return { ok: true, rows };
}
