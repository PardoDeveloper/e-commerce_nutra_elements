import { analyzeBarcode } from "./barcode.js";
import { parsePrice, parseStock, type Cell } from "./cells.js";
import { availableStock, planPriceChange } from "./discount.js";
import { extractPackInfo, proposeDisplayName } from "./names.js";
import { loadProduct } from "./product.js";
import { MSG, type ChunkPlan, type Item } from "./prepare.js";
import { Collector } from "./report.js";
import { updateOp, type NewProductFields, type ProductData, type ProductOp, type ProductPatch } from "./types.js";

// Planificadores de importCatalog, importPrices e importStock (functions.md 5.1 a 5.3).
// Puros: reciben los documentos ya leídos y devuelven las operaciones y el reporte parcial.

type RawProducts = ReadonlyMap<string, Record<string, unknown>>;
type MaybeCell = Cell | undefined;

export interface CatalogRow {
  ID?: MaybeCell;
  NOMBRE?: MaybeCell;
  CODIGO_BARRA?: MaybeCell;
  STOCK_ACTUAL?: MaybeCell;
  PRECIO_VENTA_PUBLICO?: MaybeCell;
  ACTIVO?: MaybeCell;
  LABORATORIO?: MaybeCell;
  DESCRIPCION?: MaybeCell;
}
export interface PriceRow {
  SKU?: MaybeCell;
  PRECIO?: MaybeCell;
}
export interface StockRow {
  SKU?: MaybeCell;
  STOCK?: MaybeCell;
}

const HOUSE_LAB = "NUTRA ELEMENTS";
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

const MAX_DESCRIPTION = 5000;
// En la descripción se admiten saltos de línea y tabulaciones; el resto de los caracteres de control no.
// eslint-disable-next-line no-control-regex
const DESCRIPTION_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

const MSG_STOCK_INVALID = "El stock debe ser un entero entre 0 y 1.000.000.";
const MSG_STOCK_EMPTY = "Stock vacío: no se toca el producto (una celda en blanco no debe dejarlo sin stock).";

// ---------- importPrices ----------

export function planImportPrices(items: readonly Item<PriceRow>[], raw: RawProducts): ChunkPlan {
  const c = new Collector();
  const ops: ProductOp[] = [];
  for (const { row, sku, input } of items) {
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
    const price = parsePrice(input.PRECIO);
    if (!price.ok) {
      c.reject(row, "INVALID_PRICE", MSG.invalidPrice, sku);
      continue;
    }
    const change = planPriceChange(product, price.value);
    if (!change) {
      c.unchanged++;
      continue;
    }
    c.changes.push({ row, sku, name: product.name, field: "price", from: product.price, to: price.value });
    if (change.discountRemoved) c.warn("DISCOUNT_REMOVED", "El descuento fijo dejó de ser válido con el precio nuevo y se eliminó.", sku);
    ops.push(updateOp(product, change.patch));
    c.updated++;
  }
  return { ops, collector: c };
}

// ---------- importStock ----------

export function planImportStock(items: readonly Item<StockRow>[], raw: RawProducts): ChunkPlan {
  const c = new Collector();
  const ops: ProductOp[] = [];
  for (const { row, sku, input } of items) {
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
    const stock = parseStock(input.STOCK);
    if (stock.kind === "empty") {
      // D-024: una celda vacía NO es 0 (no se vacía el inventario por accidente).
      c.reject(row, "EMPTY_STOCK", MSG_STOCK_EMPTY, sku);
      continue;
    }
    if (stock.kind === "invalid") {
      c.reject(row, "INVALID_STOCK", MSG_STOCK_INVALID, sku);
      continue;
    }
    if (stock.kind === "corrected") c.corrected.push({ row, sku, field: "stock", from: stock.from, to: 0 });
    const available = availableStock(stock.value, product.reserved);
    if (available === product.stock) {
      c.unchanged++;
      continue;
    }
    c.changes.push({ row, sku, name: product.name, field: "stock", from: product.stock, to: available });
    ops.push(updateOp(product, { stock: available, inStock: available > 0 }));
    c.updated++;
  }
  return { ops, collector: c };
}

// ---------- importCatalog ----------

function parseActive(cell: MaybeCell): boolean | null {
  if (typeof cell !== "string") return null;
  const text = cell.trim().toUpperCase();
  if (text === "SI") return true;
  if (text === "NO") return false;
  return null;
}

function parseSourceName(cell: MaybeCell): string | null {
  if (typeof cell !== "string") return null;
  const name = cell.trim();
  if (name.length < 1 || name.length > 200 || CONTROL_CHARS.test(name)) return null;
  return name;
}

type DescriptionCell = { kind: "empty" } | { kind: "ok"; value: string } | { kind: "invalid" };

/** DESCRIPCION es opcional: una celda vacía no borra la descripción guardada (como el stock, D-024). */
function parseDescription(cell: MaybeCell): DescriptionCell {
  if (cell === null || cell === undefined) return { kind: "empty" };
  const text = String(cell).replace(/\r\n?/g, "\n").trim();
  if (text.length === 0) return { kind: "empty" };
  if (text.length > MAX_DESCRIPTION || DESCRIPTION_CONTROL_CHARS.test(text)) return { kind: "invalid" };
  return { kind: "ok", value: text };
}

export function planImportCatalog(items: readonly Item<CatalogRow>[], raw: RawProducts): ChunkPlan {
  const c = new Collector();
  const ops: ProductOp[] = [];
  for (const { row, sku, input } of items) {
    const loaded = loadProduct(raw, sku);
    if (loaded.status === "corrupt") {
      c.reject(row, "INVALID_PRODUCT_DATA", MSG.corrupt, sku);
      continue;
    }
    const existing: ProductData | null = loaded.status === "ok" ? loaded.product : null;
    // Un SKU eliminado no se revive ni se modifica con la planilla (D-029).
    if (existing?.deleted) {
      c.reject(row, "PRODUCT_DELETED", MSG.deleted, sku);
      continue;
    }
    const sourceName = parseSourceName(input.NOMBRE);
    if (sourceName === null) {
      c.reject(row, "INVALID_NAME", "NOMBRE vacío, de más de 200 caracteres o con caracteres no permitidos.", sku);
      continue;
    }
    const price = parsePrice(input.PRECIO_VENTA_PUBLICO);
    if (!price.ok) {
      c.reject(row, "INVALID_PRICE", MSG.invalidPrice, sku);
      continue;
    }
    const active = parseActive(input.ACTIVO);
    if (active === null) {
      c.reject(row, "INVALID_ACTIVE", 'ACTIVO debe ser "SI" o "NO".', sku);
      continue;
    }
    const stock = parseStock(input.STOCK_ACTUAL);
    if (stock.kind === "invalid") {
      c.reject(row, "INVALID_STOCK", MSG_STOCK_INVALID, sku);
      continue;
    }
    if (existing && stock.kind === "empty") {
      c.reject(row, "EMPTY_STOCK", "Stock vacío en un producto existente: no se toca el producto.", sku);
      continue;
    }

    // Advertencias (no bloquean).
    if (typeof input.LABORATORIO === "string" && input.LABORATORIO.trim().toUpperCase() !== HOUSE_LAB) {
      c.warn("LABORATORY_MISMATCH", `LABORATORIO distinto de "${HOUSE_LAB}".`, sku);
    }
    const description = parseDescription(input.DESCRIPCION);
    if (description.kind === "invalid") {
      c.warn("INVALID_DESCRIPTION", `DESCRIPCION de más de ${MAX_DESCRIPTION} caracteres o con caracteres no permitidos: no se guarda.`, sku);
    }
    const barcode = analyzeBarcode(input.CODIGO_BARRA);
    if (barcode.isbnRange) c.warn("BARCODE_ISBN_RANGE", "El código de barras empieza con 978 o 979; no se publicará como GTIN.", sku);
    if (barcode.tooLong) c.warn("BARCODE_TOO_LONG", "El código de barras tiene más de 32 caracteres y se descartó.", sku);

    if (!existing) {
      // Importación inicial: stock vacío o negativo pasa a 0 y se informa (D-018).
      let initial = 0;
      if (stock.kind === "ok") initial = stock.value;
      else if (stock.kind === "empty") c.corrected.push({ row, sku, field: "stock", from: null, to: 0 });
      else if (stock.kind === "corrected") c.corrected.push({ row, sku, field: "stock", from: stock.from, to: 0 });
      const pack = extractPackInfo(sourceName);
      const fields: NewProductFields = {
        sku,
        sourceName,
        name: proposeDisplayName(sourceName) || sourceName.slice(0, 120),
        description: description.kind === "ok" ? description.value : null,
        price: price.value,
        stock: initial,
        active,
        barcode: barcode.barcode,
        barcodeValid: barcode.barcodeValid,
        gtin: barcode.gtin,
        unitsPerPack: pack.unitsPerPack,
        format: pack.format,
        source: "controlfarma-xls",
      };
      c.changes.push({ row, sku, name: fields.name, field: "create", from: null, to: price.value });
      ops.push({ type: "create", sku, fields, imported: true });
      c.created++;
      continue;
    }

    // Reimportación: pisa precio y stock; del contenido solo la descripción, si la celda trae texto (D-046).
    // Nunca toca los descuentos (P13).
    const patch: ProductPatch = {};
    const priceChange = planPriceChange(existing, price.value);
    if (priceChange) {
      Object.assign(patch, priceChange.patch);
      c.changes.push({ row, sku, name: existing.name, field: "price", from: existing.price, to: price.value });
      if (priceChange.discountRemoved) c.warn("DISCOUNT_REMOVED", "El descuento fijo dejó de ser válido con el precio nuevo y se eliminó.", sku);
    }
    if (stock.kind === "corrected") c.corrected.push({ row, sku, field: "stock", from: stock.from, to: 0 });
    if (stock.kind === "ok" || stock.kind === "corrected") {
      const available = availableStock(stock.value, existing.reserved);
      if (available !== existing.stock) {
        patch.stock = available;
        patch.inStock = available > 0;
        c.changes.push({ row, sku, name: existing.name, field: "stock", from: existing.stock, to: available });
      }
    }
    if (description.kind === "ok" && description.value !== existing.description) {
      patch.description = description.value;
      c.changes.push({ row, sku, name: existing.name, field: "description", from: existing.description, to: description.value });
    }
    if (active !== existing.active) patch.active = active;
    if (sourceName !== existing.sourceName) patch.sourceName = sourceName;
    if (barcode.barcode !== existing.barcode) patch.barcode = barcode.barcode;
    if (barcode.barcodeValid !== existing.barcodeValid) patch.barcodeValid = barcode.barcodeValid;
    if (barcode.gtin !== existing.gtin) patch.gtin = barcode.gtin;

    if (Object.keys(patch).length === 0) {
      c.unchanged++;
      continue;
    }
    ops.push(updateOp(existing, patch, { imported: true }));
    c.updated++;
  }
  return { ops, collector: c };
}
