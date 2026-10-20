import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore, type Transaction } from "firebase-admin/firestore";
import type { CatalogStore, CatalogTx, ImportRecord } from "./store.js";
import type { ProductOp } from "./types.js";
import { buildCreateData, buildUpdateData } from "./writes.js";

// Implementación del almacén con el Admin SDK (única parte del catálogo que toca Firestore).
// Sin verificar contra Firestore real (D-026): se prueba en la primera ejecución con emulador o
// con el proyecto de staging.

const PRODUCTS = "products";
const CATEGORIES = "categories";
const IMPORTS = "imports";
/** Máximo de documentos con el mismo slug que se leen al validar unicidad (debería haber 0 o 1). */
const SLUG_QUERY_LIMIT = 10;

class FirestoreTx implements CatalogTx {
  constructor(
    private readonly db: Firestore,
    private readonly t: Transaction,
    private readonly readOnly: boolean,
  ) {}

  private async readDocs(collection: string, ids: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
    const out = new Map<string, Record<string, unknown>>();
    if (ids.length === 0) return out;
    const refs = ids.map((id) => this.db.collection(collection).doc(id));
    const snaps = await this.t.getAll(...refs);
    for (const snap of snaps) {
      const data = snap.data();
      if (snap.exists && data) out.set(snap.id, data);
    }
    return out;
  }

  getProducts(skus: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
    return this.readDocs(PRODUCTS, skus);
  }

  getCategories(ids: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
    return this.readDocs(CATEGORIES, ids);
  }

  async findProductsBySlug(slug: string): Promise<{ sku: string; deleted: boolean }[]> {
    const snap = await this.t.get(this.db.collection(PRODUCTS).where("slug", "==", slug).limit(SLUG_QUERY_LIMIT));
    return snap.docs.map((d) => {
      const deletedAt: unknown = d.get("deletedAt");
      return { sku: d.id, deleted: deletedAt !== null && deletedAt !== undefined };
    });
  }

  apply(ops: readonly ProductOp[], actor: { uid: string }): void {
    if (this.readOnly) throw new Error("Transacción de solo lectura");
    const now = FieldValue.serverTimestamp();
    for (const op of ops) {
      const ref = this.db.collection(PRODUCTS).doc(op.sku);
      if (op.type === "create") this.t.create(ref, buildCreateData(op, now));
      else this.t.update(ref, buildUpdateData(op, now, actor.uid));
    }
  }
}

/** Almacén sobre Firestore. Reutiliza la app de Firebase ya inicializada (o la inicializa). */
export function createFirestoreStore(db: Firestore = getFirestore(getApps().length > 0 ? getApp() : initializeApp())): CatalogStore {
  return {
    async runTransaction<T>(fn: (tx: CatalogTx) => Promise<T>, options?: { readOnly?: boolean }): Promise<T> {
      if (options?.readOnly) {
        return db.runTransaction((t) => fn(new FirestoreTx(db, t, true)), { readOnly: true });
      }
      return db.runTransaction((t) => fn(new FirestoreTx(db, t, false)));
    },
    async saveImport(record: ImportRecord): Promise<string> {
      const ref = db.collection(IMPORTS).doc();
      await ref.set({ ...record, createdAt: FieldValue.serverTimestamp() });
      return ref.id;
    },
  };
}
