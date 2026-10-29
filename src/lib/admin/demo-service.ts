// Implementación SIMULADA de AdminService (D-028). Todo vive en memoria del navegador: al
// recargar la página vuelve a los datos iniciales. NO escribe en ningún lado.
// >>> Se reemplaza por una implementación con Firebase (httpsCallable + Firestore) que cumpla
// la misma interfaz; ver config.ts: este modo NO puede llegar a producción. <<<
import {
  MAX_DELETE_SKUS,
  type BatchOp,
  type BatchPlan,
  planApplyDiscount,
  planImportCatalog,
  planImportPrices,
  planImportStock,
  SKU_PATTERN,
} from "./batch";
import { DEFAULT_CATEGORIES } from "@/lib/data/defaults";
import { cleanCategoryName, newCategorySlug, nextCategoryOrder, renamedCategorySlug, sortCategories } from "./categories";
import { AdminServiceError } from "./errors";
import * as orderLogic from "./orders";
import { computeFinalPrice, validateDiscount } from "./pricing";
import type { AdminService, AdminState, CommerceUpdateResponse, OrderActionResponse } from "./service";
import type { AdminCategory, AdminOrder, AdminProduct, AdminSettings, BatchReport, DeleteReport, InvalidRow, ProductContentPatch, RestoreReport } from "./types";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ADMIN_ID = "demo-admin";

export interface DemoSeed {
  products: AdminProduct[];
  orders: AdminOrder[];
  settings: AdminSettings;
  /** Si falta, las 6 iniciales (D-023). */
  categories?: AdminCategory[];
}

function recompute(p: AdminProduct): AdminProduct {
  return { ...p, finalPrice: computeFinalPrice(p.price, p.discount), inStock: p.stock > 0 };
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    .slice(0, 120);
}

export function validateSettings(s: AdminSettings): void {
  const fields: string[] = [];
  const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
  if (!int(s.shippingFee, 0, 100_000)) fields.push("shippingFee");
  if (s.freeShippingThreshold !== null && !int(s.freeShippingThreshold, 1, 10_000_000)) fields.push("freeShippingThreshold");
  if (!int(s.maxQtyPerItem, 1, 100)) fields.push("maxQtyPerItem");
  if (!int(s.reservationMinutes.flow, 5, 240)) fields.push("reservationMinutes.flow");
  if (s.pickup.address.length > 200 || (s.pickup.enabled && s.pickup.address.trim() === "")) fields.push("pickup.address");
  if (s.pickup.hours.length > 200 || (s.pickup.enabled && s.pickup.hours.trim() === "")) fields.push("pickup.hours");
  if (fields.length > 0) throw new AdminServiceError("INVALID_INPUT", `Revisa estos campos: ${fields.join(", ")}.`);
}

/** Reglas de `setProductsPublished` al publicar (functions.md 5.5). Devuelve el código o null. */
export function publishBlocker(p: AdminProduct, others: Iterable<AdminProduct>, pendingSlugs: ReadonlySet<string>): { code: string; message: string } | null {
  if (p.deletedAt) return { code: "PRODUCT_DELETED", message: "El producto está eliminado: restáuralo primero." };
  if (!p.active) return { code: "NOT_ACTIVE", message: "El producto está desactivado." };
  if (p.name.trim() === "") return { code: "INVALID_NAME", message: "Falta el nombre." };
  if (!p.slug) return { code: "MISSING_SLUG", message: "Falta el slug." };
  if (!SLUG_PATTERN.test(p.slug) || p.slug.length > 80) return { code: "INVALID_SLUG", message: "El slug no es válido." };
  for (const o of others) {
    if (o.sku !== p.sku && o.slug === p.slug) return { code: "DUPLICATE_SLUG", message: "Otro producto usa el mismo slug." };
  }
  if (pendingSlugs.has(p.slug)) return { code: "DUPLICATE_SLUG", message: "Otro producto del mismo lote usa el mismo slug." };
  if (p.images.length === 0 || p.images.some((i) => i.alt.trim() === "")) {
    return { code: "MISSING_IMAGE", message: "Falta al menos una imagen con texto alternativo." };
  }
  if (p.price < 1) return { code: "INVALID_PRICE", message: "El precio debe ser al menos 1." };
  return null;
}

/** Valida la lista de `deleteProducts` / `restoreProducts` (máximo 200, sin repetidos, estado correcto). */
function classifyDeletion(skus: string[], map: Map<string, AdminProduct>, mode: "delete" | "restore") {
  if (skus.length === 0) throw new AdminServiceError("EMPTY_BATCH", "Elige al menos un producto.");
  if (skus.length > MAX_DELETE_SKUS) {
    throw new AdminServiceError("TOO_MANY_ROWS", `Máximo ${MAX_DELETE_SKUS} productos por operación. Elegiste ${skus.length}.`);
  }
  const valid: string[] = [];
  const invalid: InvalidRow[] = [];
  const seen = new Set<string>();
  skus.forEach((sku, i) => {
    const row = i + 1;
    const p = map.get(sku);
    if (!p) return void invalid.push({ row, sku, code: "SKU_NOT_FOUND", message: "El SKU no existe en el catálogo." });
    if (seen.has(sku)) return void invalid.push({ row, sku, code: "DUPLICATE_SKU", message: "SKU repetido en la lista." });
    seen.add(sku);
    if (mode === "delete" && p.deletedAt) return void invalid.push({ row, sku, code: "ALREADY_DELETED", message: "El producto ya estaba eliminado." });
    if (mode === "restore" && !p.deletedAt) return void invalid.push({ row, sku, code: "NOT_DELETED", message: "El producto no está eliminado." });
    valid.push(sku);
  });
  return { map, valid, invalid };
}

export function createDemoService(seed: DemoSeed, clock: () => Date = () => new Date()): AdminService {
  const initialCategories = seed.categories ?? DEFAULT_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, order: c.order, published: true }));
  let state: AdminState = { products: seed.products, categories: sortCategories(initialCategories), orders: seed.orders, settings: seed.settings };
  const listeners = new Set<() => void>();
  const set = (next: Partial<AdminState>) => {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };
  const productMap = () => new Map(state.products.map((p) => [p.sku, p] as const));
  const nowIso = () => clock().toISOString();

  /** Aplica las operaciones del plan sobre los productos (solo si no es dryRun). */
  function applyOps(ops: BatchOp[]): void {
    const map = productMap();
    for (const op of ops) {
      if (op.type === "create") {
        map.set(
          op.sku,
          recompute({
            sku: op.sku,
            sourceName: op.sourceName,
            name: titleCase(op.name),
            slug: null,
            description: null,
            shortDescription: null,
            categoryId: null,
            images: [],
            price: op.price,
            discount: null,
            finalPrice: op.price,
            stock: op.stock,
            reserved: 0,
            inStock: op.stock > 0,
            active: op.active,
            published: false,
            format: null,
            unitsPerPack: null,
            featured: false,
            seo: null,
            source: "controlfarma-xls",
            commissionPerUnit: null,
            deletedAt: null,
            deletedBy: null,
          }),
        );
        continue;
      }
      const current = map.get(op.sku);
      if (!current) continue;
      if (op.type === "discount") {
        map.set(op.sku, recompute({ ...current, discount: op.discount }));
        continue;
      }
      let next = { ...current };
      if (op.price !== undefined) next.price = op.price;
      if (op.removeDiscount) next.discount = null;
      if (op.stock !== undefined) next.stock = op.stock;
      if (op.active !== undefined) next.active = op.active;
      next = recompute(next);
      map.set(op.sku, next);
    }
    set({ products: [...map.values()] });
  }

  async function runPlan(plan: BatchPlan, dryRun: boolean | undefined): Promise<BatchReport> {
    if (!dryRun) applyOps(plan.ops);
    return plan.report;
  }

  function findOrder(orderNumber: string): AdminOrder {
    const order = state.orders.find((o) => o.orderNumber === orderNumber);
    if (!order) throw new AdminServiceError("ORDER_NOT_FOUND", "El pedido no existe.");
    return order;
  }

  /** Aplica el resultado de una regla de pedido: guarda el pedido y ajusta el stock. */
  function commitOrder(result: orderLogic.OrderResult, before: AdminOrder): OrderActionResponse {
    if (!result.ok) throw new AdminServiceError(result.code, result.message);
    if (result.changed) {
      const map = productMap();
      if (result.restockItems || result.releaseItems) {
        for (const it of before.items) {
          const p = map.get(it.sku);
          if (p) map.set(it.sku, recompute({ ...p, stock: p.stock + it.qty }));
        }
      }
      set({
        orders: state.orders.map((o) => (o.orderNumber === before.orderNumber ? result.order : o)),
        products: result.restockItems || result.releaseItems ? [...map.values()] : state.products,
      });
    }
    return { order: result.order, changed: result.changed, message: result.message };
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    importCatalog: ({ rows, ...opts }) => runPlan(planImportCatalog(rows, productMap(), opts), opts.dryRun),
    importPrices: ({ rows, ...opts }) => runPlan(planImportPrices(rows, productMap(), opts), opts.dryRun),
    importStock: ({ rows, ...opts }) => runPlan(planImportStock(rows, productMap(), opts), opts.dryRun),
    applyDiscount: ({ skus, discount, ...opts }) => runPlan(planApplyDiscount(skus, discount, productMap(), opts), opts.dryRun),

    async setProductsPublished({ skus, published, ...opts }) {
      if (skus.length === 0) throw new AdminServiceError("EMPTY_BATCH", "Elige al menos un producto.");
      if (skus.length > 150) throw new AdminServiceError("TOO_MANY_ROWS", "Máximo 150 productos por operación.");
      const map = productMap();
      const invalid: BatchReport["invalid"] = [];
      const warnings: BatchReport["warnings"] = [];
      const changed: AdminProduct[] = [];
      const seen = new Set<string>();
      const batchSlugs = new Set<string>();
      let unchanged = 0;
      skus.forEach((sku, i) => {
        const p = map.get(sku);
        if (!p) return void invalid.push({ row: i + 1, sku, code: "SKU_NOT_FOUND", message: "El SKU no existe en el catálogo." });
        if (seen.has(sku)) return void invalid.push({ row: i + 1, sku, code: "DUPLICATE_SKU", message: "SKU repetido en la lista." });
        seen.add(sku);
        if (p.published === published) return void unchanged++;
        if (published) {
          const blocker = publishBlocker(p, map.values(), batchSlugs);
          if (blocker) return void invalid.push({ row: i + 1, sku, ...blocker });
          if (p.slug) batchSlugs.add(p.slug);
        }
        changed.push({ ...p, published });
      });
      if (!opts.dryRun && changed.length > 0) {
        for (const p of changed) map.set(p.sku, p);
        set({ products: [...map.values()] });
      }
      return {
        importId: opts.dryRun ? null : "demo-publish",
        dryRun: opts.dryRun ?? false,
        rows: skus.length,
        created: 0,
        updated: changed.length,
        unchanged,
        skipped: invalid.length,
        corrected: [],
        invalid,
        warnings,
        truncated: false,
        changes: [],
      };
    },

    async deleteProducts({ skus }): Promise<DeleteReport> {
      const { map, valid, invalid } = classifyDeletion(skus, productMap(), "delete");
      const at = nowIso();
      for (const sku of valid) {
        const p = map.get(sku);
        if (p) map.set(sku, { ...p, published: false, deletedAt: at, deletedBy: ADMIN_ID });
      }
      if (valid.length > 0) set({ products: [...map.values()] });
      return { rows: skus.length, deleted: valid.length, deletedSkus: valid, invalid, skipped: invalid.length };
    },

    async restoreProducts({ skus }): Promise<RestoreReport> {
      const { map, valid, invalid } = classifyDeletion(skus, productMap(), "restore");
      for (const sku of valid) {
        const p = map.get(sku);
        // Vuelve despublicado: publicarlo es una decisión aparte.
        if (p) map.set(sku, { ...p, published: false, deletedAt: null, deletedBy: null });
      }
      if (valid.length > 0) set({ products: [...map.values()] });
      return { rows: skus.length, restored: valid.length, restoredSkus: valid, invalid, skipped: invalid.length };
    },

    async createProduct({ sku, name, price, stock, barcode }) {
      void barcode;
      if (!SKU_PATTERN.test(sku)) throw new AdminServiceError("INVALID_SKU", "El SKU solo admite letras, números, guion y guion bajo (máx. 32).");
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 120) throw new AdminServiceError("INVALID_NAME", "El nombre debe tener entre 1 y 120 caracteres.");
      if (!Number.isInteger(price) || price < 1 || price > 10_000_000) throw new AdminServiceError("INVALID_PRICE", "El precio debe ser un entero entre 1 y 10.000.000.");
      if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) throw new AdminServiceError("INVALID_STOCK", "El stock debe ser un entero entre 0 y 1.000.000.");
      const existing = state.products.find((p) => p.sku === sku);
      if (existing?.deletedAt) throw new AdminServiceError("SKU_EXISTS", "Existe un producto eliminado con ese SKU: restáuralo en lugar de crearlo de nuevo.");
      if (existing) throw new AdminServiceError("SKU_EXISTS", "Ya existe un producto con ese SKU.");
      const product = recompute({
        sku,
        sourceName: trimmed,
        name: trimmed,
        slug: null,
        description: null,
        shortDescription: null,
        categoryId: null,
        images: [],
        price,
        discount: null,
        finalPrice: price,
        stock,
        reserved: 0,
        inStock: stock > 0,
        active: true,
        published: false,
        format: null,
        unitsPerPack: null,
        featured: false,
        seo: null,
        source: "manual",
        commissionPerUnit: null,
        deletedAt: null,
        deletedBy: null,
      });
      set({ products: [...state.products, product] });
      return { sku, created: true };
    },

    async updateProductCommerce({ sku, price, stock, commissionPerUnit }): Promise<CommerceUpdateResponse> {
      const current = state.products.find((p) => p.sku === sku);
      if (!current) throw new AdminServiceError("SKU_NOT_FOUND", "El SKU no existe en el catálogo.");
      if (current.deletedAt) throw new AdminServiceError("PRODUCT_DELETED", "El producto está eliminado: restáuralo para editarlo.");
      if (price === undefined && stock === undefined && commissionPerUnit === undefined) throw new AdminServiceError("INVALID_INPUT", "Indica el precio, el stock o la comisión.");
      if (commissionPerUnit !== undefined && commissionPerUnit !== null && (!Number.isInteger(commissionPerUnit) || commissionPerUnit < 0 || commissionPerUnit > 10_000_000)) {
        throw new AdminServiceError("INVALID_INPUT", "La comisión debe ser un monto en pesos entre $0 y $10.000.000.");
      }
      if (price !== undefined && (!Number.isInteger(price) || price < 1 || price > 10_000_000)) {
        throw new AdminServiceError("INVALID_PRICE", "El precio debe ser un entero entre 1 y 10.000.000.");
      }
      if (stock !== undefined && (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000)) {
        throw new AdminServiceError("INVALID_STOCK", "El stock debe ser un entero entre 0 y 1.000.000.");
      }
      const warnings: string[] = [];
      let next = { ...current };
      if (price !== undefined) {
        next.price = price;
        if (next.discount && validateDiscount(price, next.discount) !== null) {
          next.discount = null;
          warnings.push("DISCOUNT_REMOVED: el descuento fijo dejó de ser válido con el precio nuevo y se eliminó.");
        }
      }
      // El stock enviado es el físico; lo disponible descuenta lo reservado.
      if (stock !== undefined) next.stock = Math.max(0, stock - current.reserved);
      if (commissionPerUnit !== undefined) next.commissionPerUnit = commissionPerUnit;
      next = recompute(next);
      set({ products: state.products.map((p) => (p.sku === sku ? next : p)) });
      return { sku, price: next.price, finalPrice: next.finalPrice, stock: next.stock, commissionPerUnit: next.commissionPerUnit, warnings };
    },

    async updateProductContent(sku, patch: ProductContentPatch) {
      const current = state.products.find((p) => p.sku === sku);
      if (!current) throw new AdminServiceError("SKU_NOT_FOUND", "El SKU no existe en el catálogo.");
      if (current.deletedAt) throw new AdminServiceError("PRODUCT_DELETED", "El producto está eliminado: restáuralo para editarlo.");
      if (patch.name !== undefined && (patch.name.trim() === "" || patch.name.length > 120)) throw new AdminServiceError("INVALID_NAME", "El nombre debe tener entre 1 y 120 caracteres.");
      if (patch.description != null && patch.description.length > 5000) throw new AdminServiceError("INVALID_INPUT", "La descripción admite hasta 5000 caracteres.");
      if (patch.shortDescription != null && patch.shortDescription.length > 300) throw new AdminServiceError("INVALID_INPUT", "La descripción corta admite hasta 300 caracteres.");
      if (patch.images && patch.images.length > 8) throw new AdminServiceError("INVALID_INPUT", "Máximo 8 imágenes.");
      if (patch.categoryId != null && !state.categories.some((c) => c.slug === patch.categoryId)) throw new AdminServiceError("INVALID_CATEGORY", "La categoría no existe.");
      if (patch.slug !== undefined) {
        if (current.published) throw new AdminServiceError("SLUG_LOCKED", "El slug no se puede cambiar mientras el producto está publicado.");
        if (patch.slug !== null && (!SLUG_PATTERN.test(patch.slug) || patch.slug.length > 80)) throw new AdminServiceError("INVALID_SLUG", "El slug solo admite minúsculas, números y guiones.");
      }
      if (patch.seo?.title && patch.seo.title.length > 70) throw new AdminServiceError("INVALID_INPUT", "El título SEO admite hasta 70 caracteres.");
      if (patch.seo?.description && patch.seo.description.length > 170) throw new AdminServiceError("INVALID_INPUT", "La descripción SEO admite hasta 170 caracteres.");
      set({ products: state.products.map((p) => (p.sku === sku ? { ...p, ...patch } : p)) });
    },

    async createCategory({ name }) {
      const clean = cleanCategoryName(name);
      const slug = newCategorySlug(clean, state.categories);
      set({ categories: sortCategories([...state.categories, { slug, name: clean, order: nextCategoryOrder(state.categories), published: true }]) });
      return { slug };
    },

    async updateCategory(slug, { name }) {
      const clean = cleanCategoryName(name);
      if (!state.categories.some((c) => c.slug === slug)) throw new AdminServiceError("CATEGORY_NOT_FOUND", "La categoría no existe.");
      const next = renamedCategorySlug(slug, clean, state.categories);
      set({
        categories: sortCategories(state.categories.map((c) => (c.slug === slug ? { ...c, slug: next, name: clean } : c))),
        products: next === slug ? state.products : state.products.map((p) => (p.categoryId === slug ? { ...p, categoryId: next } : p)),
      });
      return { slug: next };
    },

    async deleteCategory(slug) {
      if (!state.categories.some((c) => c.slug === slug)) throw new AdminServiceError("CATEGORY_NOT_FOUND", "La categoría no existe.");
      let productsUpdated = 0;
      const products = state.products.map((p) => {
        if (p.categoryId !== slug) return p;
        productsUpdated++;
        return { ...p, categoryId: null };
      });
      set({ categories: state.categories.filter((c) => c.slug !== slug), products });
      return { productsUpdated };
    },

    async setProductActive(sku, active) {
      const current = state.products.find((p) => p.sku === sku);
      if (!current) throw new AdminServiceError("SKU_NOT_FOUND", "El SKU no existe en el catálogo.");
      if (current.deletedAt) throw new AdminServiceError("PRODUCT_DELETED", "El producto está eliminado: restáuralo para editarlo.");
      // Un producto inactivo no puede seguir publicado.
      set({ products: state.products.map((p) => (p.sku === sku ? { ...p, active, published: active ? p.published : false } : p)) });
    },


    async cancelOrder({ orderNumber, reason }) {
      const order = findOrder(orderNumber);
      return commitOrder(orderLogic.cancelOrder(order, reason, { now: nowIso(), by: ADMIN_ID }), order);
    },

    async updateFulfillment({ orderNumber, to, note, reason }) {
      const order = findOrder(orderNumber);
      return commitOrder(orderLogic.updateFulfillment(order, to, { note, reason }, { now: nowIso(), by: ADMIN_ID }), order);
    },

    async recordManualRefund({ orderNumber, ...input }) {
      const order = findOrder(orderNumber);
      return commitOrder(orderLogic.recordManualRefund(order, input, { now: nowIso(), by: ADMIN_ID }), order);
    },

    async saveSettings(settings) {
      validateSettings(settings);
      set({ settings });
    },
  };
}
