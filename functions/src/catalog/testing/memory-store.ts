import type { CatalogStore, CatalogTx, ImportRecord } from "../store.js";
import type { ProductOp } from "../types.js";
import { buildCreateData, buildUpdateData } from "../writes.js";

// Almacén en memoria para tests unitarios (sin emulador, D-026). Imita lo esencial de Firestore:
// transacciones serializadas, lecturas antes de escrituras, `create` que falla si el documento
// existe, y reintentos opcionales de la función de la transacción (para comprobar que los
// planificadores se pueden repetir sin efectos).

export interface MemoryStoreOptions {
  /** Ejecuta la función de cada transacción una vez de más (y descarta el resultado) antes de la definitiva. */
  simulateRetry?: boolean;
  /** Falla la transacción número N (1 = la primera), después de ejecutar la función. */
  failTransactionNumber?: number;
}

export class MemoryStore implements CatalogStore {
  products = new Map<string, Record<string, unknown>>();
  categories = new Map<string, Record<string, unknown>>();
  imports: { id: string; record: ImportRecord; createdAt: Date }[] = [];
  transactions = 0;
  /** Reloj de los tests: lo que se escribe como "ahora". */
  clock = new Date("2026-10-19T15:00:00.000Z");
  private queue: Promise<unknown> = Promise.resolve();

  constructor(public options: MemoryStoreOptions = {}) {}

  seedProduct(sku: string, data: Record<string, unknown>): void {
    this.products.set(sku, { sku, ...data });
  }

  product(sku: string): Record<string, unknown> {
    const p = this.products.get(sku);
    if (!p) throw new Error(`Producto ${sku} no existe en el almacén de prueba`);
    return p;
  }

  runTransaction<T>(fn: (tx: CatalogTx) => Promise<T>, options?: { readOnly?: boolean }): Promise<T> {
    const run = async (): Promise<T> => {
      this.transactions++;
      const number = this.transactions;
      const attempt = async (): Promise<{ result: T; writes: ProductOp[]; uid: string }> => {
        const writes: ProductOp[] = [];
        let uid = "";
        let wrote = false;
        const tx: CatalogTx = {
          getProducts: async (skus) => {
            if (wrote) throw new Error("Lectura después de una escritura en la transacción");
            return new Map(skus.filter((s) => this.products.has(s)).map((s) => [s, structuredClone(this.product(s))]));
          },
          getCategories: async (ids) => new Map(ids.filter((i) => this.categories.has(i)).map((i) => [i, structuredClone(this.categories.get(i) as Record<string, unknown>)])),
          findProductsBySlug: async (slug) =>
            [...this.products.entries()]
              .filter(([, d]) => d["slug"] === slug)
              .map(([sku, d]) => ({ sku, deleted: d["deletedAt"] !== null && d["deletedAt"] !== undefined })),
          apply: (ops, actor) => {
            if (options?.readOnly) throw new Error("Transacción de solo lectura");
            wrote = true;
            uid = actor.uid;
            writes.push(...ops);
          },
        };
        const result = await fn(tx);
        return { result, writes, uid };
      };
      if (this.options.simulateRetry) await attempt();
      const { result, writes, uid } = await attempt();
      if (this.options.failTransactionNumber === number) throw new Error("Fallo simulado de la transacción");
      for (const op of writes) {
        if (op.type === "create") {
          if (this.products.has(op.sku)) throw new Error("create: el documento ya existe");
          this.products.set(op.sku, buildCreateData(op, this.clock));
        } else {
          const current = this.product(op.sku);
          this.products.set(op.sku, { ...current, ...buildUpdateData(op, this.clock, uid) });
        }
      }
      return result;
    };
    // Serializa: dos transacciones concurrentes no se pisan (como el bloqueo optimista con reintento).
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async saveImport(record: ImportRecord): Promise<string> {
    const id = `imp-${this.imports.length + 1}`;
    this.imports.push({ id, record: structuredClone(record), createdAt: this.clock });
    return id;
  }
}

/** Producto completo y válido para sembrar, con valores por defecto sobrescribibles. */
export function productFixture(sku: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sku,
    sourceName: `PRODUCTO ${sku}`,
    name: `Producto ${sku}`,
    slug: null,
    description: null,
    shortDescription: null,
    categoryId: null,
    images: [],
    price: 10000,
    discount: null,
    finalPrice: 10000,
    stock: 5,
    reserved: 0,
    inStock: true,
    active: true,
    published: false,
    publishedAt: null,
    barcode: null,
    barcodeValid: false,
    gtin: null,
    format: null,
    unitsPerPack: null,
    seo: null,
    source: "controlfarma-xls",
    importedAt: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}
