import { z } from "zod";
import { appError } from "../common/errors.js";
import { analyzeBarcode } from "./barcode.js";
import { parsePrice, parseStock, type Cell } from "./cells.js";
import { availableStock, planPriceChange } from "./discount.js";
import { catalogError } from "./errors.js";
import { planApplyDiscount } from "./plan-discount.js";
import { planDelete, planRestore } from "./plan-delete.js";
import { planImportCatalog, planImportPrices, planImportStock } from "./plan-import.js";
import { planSetPublished } from "./plan-publish.js";
import { readProduct } from "./product.js";
import { prepareRows, prepareSkus, type ChunkPlan, type Item } from "./prepare.js";
import { Collector } from "./report.js";
import { runBatch } from "./runner.js";
import {
  catalogRowSchema,
  createProductSchema,
  discountSchema,
  MAX_BATCH_ROWS,
  MAX_DELETE_SKUS,
  MAX_DISCOUNT_SKUS,
  parseListRequest,
  parseSingle,
  priceRowSchema,
  skuListItem,
  stockRowSchema,
  updateCommerceSchema,
  type UpdateCommerceRequest,
} from "./schemas.js";
import type { CatalogStore, CatalogTx } from "./store.js";
import { updateOp, type BatchReport, type CorrectedCell, type ProductPatch } from "./types.js";

// Lógica de cada callable, separada del registro `onCall` para probarla con el almacén de memoria.
// Cada handler: valida (zod) -> planifica (puro) -> aplica por transacciones -> registra en `imports`.

type RawProducts = ReadonlyMap<string, Record<string, unknown>>;

/** Planificador de un trozo que solo necesita leer los productos del trozo. */
function withProducts<T>(plan: (chunk: Item<T>[], raw: RawProducts) => ChunkPlan) {
  return async (tx: CatalogTx, chunk: Item<T>[]): Promise<ChunkPlan> => plan(chunk, await tx.getProducts(chunk.map((i) => i.sku)));
}

// ---------- Lotes de hoja de cálculo ----------

export async function handleImportCatalog(store: CatalogStore, data: unknown, uid: string): Promise<BatchReport> {
  const req = parseListRequest(data, { key: "rows", item: catalogRowSchema, max: MAX_BATCH_ROWS, extra: {} });
  const pre = new Collector();
  const items = prepareRows(req.items, (r) => r.ID, pre);
  return runBatch(store, { kind: "catalog", uid, dryRun: req.dryRun, fileName: req.fileName, rows: req.items.length, pre, items, plan: withProducts(planImportCatalog) });
}

export async function handleImportPrices(store: CatalogStore, data: unknown, uid: string): Promise<BatchReport> {
  const req = parseListRequest(data, { key: "rows", item: priceRowSchema, max: MAX_BATCH_ROWS, extra: {} });
  const pre = new Collector();
  const items = prepareRows(req.items, (r) => r.SKU, pre);
  return runBatch(store, { kind: "price", uid, dryRun: req.dryRun, fileName: req.fileName, rows: req.items.length, pre, items, plan: withProducts(planImportPrices) });
}

export async function handleImportStock(store: CatalogStore, data: unknown, uid: string): Promise<BatchReport> {
  const req = parseListRequest(data, { key: "rows", item: stockRowSchema, max: MAX_BATCH_ROWS, extra: {} });
  const pre = new Collector();
  const items = prepareRows(req.items, (r) => r.SKU, pre);
  return runBatch(store, { kind: "stock", uid, dryRun: req.dryRun, fileName: req.fileName, rows: req.items.length, pre, items, plan: withProducts(planImportStock) });
}

// ---------- Lotes por lista de SKU ----------

export async function handleApplyDiscount(store: CatalogStore, data: unknown, uid: string): Promise<BatchReport> {
  const req = parseListRequest(data, { key: "skus", item: skuListItem, max: MAX_DISCOUNT_SKUS, extra: { discount: discountSchema } });
  const pre = new Collector();
  const items = prepareSkus(req.items, pre);
  const discount = req.extra.discount;
  return runBatch(store, {
    kind: "discount",
    uid,
    dryRun: req.dryRun,
    fileName: req.fileName,
    rows: req.items.length,
    pre,
    items,
    plan: withProducts((chunk, raw) => planApplyDiscount(chunk, raw, discount)),
  });
}

export async function handleSetProductsPublished(store: CatalogStore, data: unknown, uid: string): Promise<BatchReport> {
  const req = parseListRequest(data, { key: "skus", item: skuListItem, max: MAX_DISCOUNT_SKUS, extra: { published: z.boolean() } });
  const pre = new Collector();
  const items = prepareSkus(req.items, pre);
  const { published } = req.extra;
  const claimed = new Map<string, string>(); // slugs reservados por trozos ya confirmados de este llamado
  return runBatch(store, {
    kind: "publish",
    uid,
    dryRun: req.dryRun,
    fileName: req.fileName,
    rows: req.items.length,
    pre,
    items,
    plan: (tx, chunk) => planSetPublished(tx, chunk, published, claimed),
  });
}

export async function handleDeleteProducts(store: CatalogStore, data: unknown, uid: string): Promise<BatchReport> {
  const req = parseListRequest(data, { key: "skus", item: skuListItem, max: MAX_DELETE_SKUS, extra: {} });
  const pre = new Collector();
  const items = prepareSkus(req.items, pre);
  return runBatch(store, { kind: "delete", uid, dryRun: req.dryRun, fileName: req.fileName, rows: req.items.length, pre, items, plan: withProducts(planDelete) });
}

export async function handleRestoreProducts(store: CatalogStore, data: unknown, uid: string): Promise<BatchReport> {
  const req = parseListRequest(data, { key: "skus", item: skuListItem, max: MAX_DELETE_SKUS, extra: {} });
  const pre = new Collector();
  const items = prepareSkus(req.items, pre);
  return runBatch(store, { kind: "restore", uid, dryRun: req.dryRun, fileName: req.fileName, rows: req.items.length, pre, items, plan: withProducts(planRestore) });
}

// ---------- Un solo producto ----------

export interface CreateProductResponse {
  sku: string;
  created: boolean;
}

function singleAudit(kind: "create" | "update", uid: string, created: number, updated: number, corrected: CorrectedCell[] = []) {
  return {
    kind,
    dryRun: false as const,
    fileName: null,
    rows: 1,
    created,
    updated,
    unchanged: 0,
    skipped: 0,
    corrected,
    invalid: [],
    warnings: [],
    truncated: false,
    createdBy: uid,
  };
}

export async function handleCreateProduct(store: CatalogStore, data: unknown, uid: string): Promise<CreateProductResponse> {
  const req = parseSingle(createProductSchema, data);
  const barcode = analyzeBarcode(req.barcode ?? null);

  const created = await store.runTransaction(async (tx) => {
    const existing = (await tx.getProducts([req.sku])).get(req.sku);
    if (existing) {
      if (existing["deletedAt"] !== null && existing["deletedAt"] !== undefined) throw catalogError("PRODUCT_DELETED", { sku: req.sku });
      const identical =
        existing["source"] === "manual" &&
        existing["sourceName"] === req.name &&
        existing["name"] === req.name &&
        existing["price"] === req.price &&
        existing["stock"] === req.stock &&
        (existing["barcode"] ?? null) === barcode.barcode;
      if (identical) return false;
      throw catalogError("SKU_EXISTS", { sku: req.sku });
    }
    tx.apply(
      [
        {
          type: "create",
          sku: req.sku,
          imported: false,
          fields: {
            sku: req.sku,
            sourceName: req.name,
            name: req.name,
            price: req.price,
            stock: req.stock,
            active: true,
            barcode: barcode.barcode,
            barcodeValid: barcode.barcodeValid,
            gtin: barcode.gtin,
            unitsPerPack: null,
            format: null,
            source: "manual",
          },
        },
      ],
      { uid },
    );
    return true;
  });

  if (created) await store.saveImport(singleAudit("create", uid, 1, 0));
  return { sku: req.sku, created };
}

export interface UpdateProductCommerceResponse {
  sku: string;
  price: number;
  finalPrice: number;
  stock: number;
  /** Comisión en CLP por unidad, o null si no está definida. */
  commissionPerUnit: number | null;
  /** Extensión aditiva: el descuento fijo dejó de ser válido con el precio nuevo y se eliminó. */
  discountRemoved: boolean;
}

export async function handleUpdateProductCommerce(store: CatalogStore, data: unknown, uid: string): Promise<UpdateProductCommerceResponse> {
  const req: UpdateCommerceRequest = parseSingle(updateCommerceSchema, data);
  const hasPrice = req.price !== undefined;
  const hasStock = req.stock !== undefined;
  const hasRate = req.commissionPerUnit !== undefined;
  if (!hasPrice && !hasStock && !hasRate) {
    throw appError("INVALID_INPUT", { fields: [{ path: "price", message: "Indica el precio, el stock o la comisión" }] });
  }

  let newPrice: number | null = null;
  if (hasPrice) {
    const parsed = parsePrice(req.price as Cell);
    if (!parsed.ok) throw catalogError("INVALID_PRICE");
    newPrice = parsed.value;
  }
  let physicalStock: number | null = null;
  const corrected: CorrectedCell[] = [];
  if (hasStock) {
    const parsed = parseStock(req.stock as Cell);
    if (parsed.kind === "empty") throw catalogError("EMPTY_STOCK");
    if (parsed.kind === "invalid") throw catalogError("INVALID_STOCK");
    physicalStock = parsed.value;
    if (parsed.kind === "corrected") corrected.push({ row: 1, sku: req.sku, field: "stock", from: parsed.from, to: 0 });
  }

  const outcome = await store.runTransaction(async (tx) => {
    const raw = await tx.getProducts([req.sku]);
    const doc = raw.get(req.sku);
    if (!doc) throw catalogError("SKU_NOT_FOUND", { sku: req.sku });
    if (doc["deletedAt"] !== null && doc["deletedAt"] !== undefined) throw catalogError("PRODUCT_DELETED", { sku: req.sku });
    const product = readProduct(req.sku, doc);
    if (!product) throw appError("INTERNAL");

    const patch: ProductPatch = {};
    let discountRemoved = false;
    if (newPrice !== null) {
      const change = planPriceChange(product, newPrice);
      if (change) {
        Object.assign(patch, change.patch);
        discountRemoved = change.discountRemoved;
      }
    }
    if (physicalStock !== null) {
      const available = availableStock(physicalStock, product.reserved);
      if (available !== product.stock) {
        patch.stock = available;
        patch.inStock = available > 0;
      }
    }
    if (hasRate && req.commissionPerUnit !== product.commissionPerUnit) patch.commissionPerUnit = req.commissionPerUnit ?? null;
    const changed = Object.keys(patch).length > 0;
    if (changed) {
      tx.apply([updateOp(product, patch)], { uid });
    }
    return {
      changed,
      discountRemoved,
      price: patch.price ?? product.price,
      finalPrice: patch.finalPrice ?? product.finalPrice,
      stock: patch.stock ?? product.stock,
      commissionPerUnit: patch.commissionPerUnit !== undefined ? patch.commissionPerUnit : product.commissionPerUnit,
    };
  });

  if (outcome.changed) await store.saveImport(singleAudit("update", uid, 0, 1, corrected));
  return {
    sku: req.sku,
    price: outcome.price,
    finalPrice: outcome.finalPrice,
    stock: outcome.stock,
    commissionPerUnit: outcome.commissionPerUnit,
    discountRemoved: outcome.discountRemoved,
  };
}
