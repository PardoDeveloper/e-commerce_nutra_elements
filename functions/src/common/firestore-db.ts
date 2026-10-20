import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { ContentionError, isIncrement, type Db, type DocData, type Tx } from "./db.js";

// Implementación del puerto `Db` con el Admin SDK. SIN verificar contra Firestore real (D-026):
// se ejercita por primera vez con emulador o con el proyecto de trabajo.

/** Timestamp -> Date en profundidad (los mapas y arreglos del pedido traen Timestamps). */
export function fromFirestore(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(fromFirestore);
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: DocData = {};
    for (const [k, v] of Object.entries(value as DocData)) out[k] = fromFirestore(v);
    return out;
  }
  return value;
}

/** Date -> se deja (el SDK lo convierte); incrementos -> FieldValue.increment. Rechaza `undefined`. */
export function toFirestore(value: unknown): unknown {
  if (value === undefined) throw new TypeError("Firestore no admite undefined");
  if (isIncrement(value)) return FieldValue.increment(value.n);
  if (Array.isArray(value)) return value.map(toFirestore);
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: DocData = {};
    for (const [k, v] of Object.entries(value as DocData)) out[k] = toFirestore(v);
    return out;
  }
  return value;
}

const toData = (data: DocData): DocData => toFirestore(data) as DocData;

class FirestoreTx implements Tx {
  constructor(
    private readonly db: Firestore,
    private readonly t: Transaction,
  ) {}

  async get(path: string): Promise<DocData | undefined> {
    const snap = await this.t.get(this.db.doc(path));
    return snap.exists ? (fromFirestore(snap.data()) as DocData) : undefined;
  }

  async getAll(paths: readonly string[]): Promise<(DocData | undefined)[]> {
    if (paths.length === 0) return [];
    const snaps = await this.t.getAll(...paths.map((p) => this.db.doc(p)));
    return snaps.map((s) => (s.exists ? (fromFirestore(s.data()) as DocData) : undefined));
  }

  create(path: string, data: DocData): void {
    this.t.create(this.db.doc(path), toData(data));
  }

  set(path: string, data: DocData, options?: { merge?: boolean }): void {
    if (options?.merge) this.t.set(this.db.doc(path), toData(data), { merge: true });
    else this.t.set(this.db.doc(path), toData(data));
  }

  update(path: string, patch: DocData): void {
    this.t.update(this.db.doc(path), toData(patch));
  }
}

function isAborted(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 10 || code === "aborted" || code === "ABORTED";
}

export function createFirestoreDb(): Db {
  if (getApps().length === 0) initializeApp();
  const db = getFirestore(getApp());
  return {
    async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      try {
        return await db.runTransaction((t) => fn(new FirestoreTx(db, t)));
      } catch (err) {
        if (isAborted(err)) throw new ContentionError();
        throw err;
      }
    },
    async get(path: string): Promise<DocData | undefined> {
      const snap = await db.doc(path).get();
      return snap.exists ? (fromFirestore(snap.data()) as DocData) : undefined;
    },
    async listExpiredPendingOrderIds(now: Date, limit: number): Promise<string[]> {
      const snap = await db
        .collection("orders")
        .where("paymentStatus", "==", "pending_payment")
        .where("reservedUntil", "<=", Timestamp.fromDate(now))
        .orderBy("reservedUntil", "asc")
        .limit(limit)
        .select()
        .get();
      return snap.docs.map((d) => d.id);
    },
    async countPendingOrdersByEmail(email: string, limit: number): Promise<number> {
      const snap = await db
        .collection("orders")
        .where("customer.email", "==", email)
        .where("paymentStatus", "==", "pending_payment")
        .limit(limit)
        .select()
        .get();
      return snap.size;
    },
  };
}
