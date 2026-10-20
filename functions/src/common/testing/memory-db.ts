import { ContentionError, isIncrement, type Db, type DocData, type Tx } from "../db.js";

// Doble en memoria del puerto `Db` para tests unitarios (D-026).
//
// QUÉ MODELA: transacciones serializables con control optimista de versiones (si otro commit toca
// un documento que esta transacción leyó, se reintenta `fn`, como hace Firestore), lecturas antes de
// escrituras (lanza si no), rechazo de `undefined` y de claves con punto en `update`, `create` que
// falla si existe, `update` que falla si no existe, `increment` y fechas.
// QUÉ NO MODELA: latencia real, bloqueos pesimistas del servidor, límites de tamaño o de escrituras
// por transacción, índices, TTL ni el reloj del servidor. NO reemplaza las pruebas contra Firestore.

interface Stored {
  data: DocData;
  version: number;
}

// Más holgado que el SDK real a propósito: el doble reintenta en "rondas" (optimista), mientras que
// Firestore usa bloqueos y encola a los competidores. No modela fallos reales por contención.
const MAX_ATTEMPTS = 30;

/** Cede el control para que otras transacciones concurrentes avancen entre lectura y commit. */
const yieldTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function assertWritable(value: unknown, where: string): void {
  if (value === undefined) throw new TypeError(`Firestore no admite undefined (${where})`);
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError(`Número no finito (${where})`);
  if (typeof value === "function") throw new TypeError(`Función no serializable (${where})`);
  if (value instanceof Date || isIncrement(value)) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertWritable(v, `${where}[${i}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertWritable(v, `${where}.${k}`);
  }
}

function resolveIncrements(target: DocData, patch: DocData): DocData {
  const out: DocData = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (isIncrement(v)) {
      const current = out[k];
      if (current !== undefined && typeof current !== "number") throw new TypeError(`increment sobre un campo no numérico (${k})`);
      out[k] = (typeof current === "number" ? current : 0) + v.n;
    } else {
      out[k] = structuredClone(v);
    }
  }
  return out;
}

type Write =
  | { kind: "create"; path: string; data: DocData }
  | { kind: "set"; path: string; data: DocData; merge: boolean }
  | { kind: "update"; path: string; data: DocData };

export class MemoryDb implements Db {
  private readonly docs = new Map<string, Stored>();
  /** Cuántas veces se reintentó una transacción por contención (para los tests). */
  retries = 0;
  /** Cuántas escrituras confirmadas hubo (para comprobar que algo "no escribió nada"). */
  commits = 0;

  constructor(seed: Record<string, DocData> = {}) {
    for (const [path, data] of Object.entries(seed)) this.docs.set(path, { data: structuredClone(data), version: 1 });
  }

  /** Lectura directa de un documento para los tests (copia). */
  peek(path: string): DocData | undefined {
    const s = this.docs.get(path);
    return s ? structuredClone(s.data) : undefined;
  }

  /** Escritura directa para preparar el escenario de un test. */
  seed(path: string, data: DocData): void {
    const prev = this.docs.get(path);
    this.docs.set(path, { data: structuredClone(data), version: (prev?.version ?? 0) + 1 });
  }

  paths(prefix: string): string[] {
    return [...this.docs.keys()].filter((p) => p.startsWith(prefix)).sort();
  }

  async get(path: string): Promise<DocData | undefined> {
    await yieldTurn();
    return this.peek(path);
  }

  async listExpiredPendingOrderIds(now: Date, limit: number): Promise<string[]> {
    const rows: { id: string; at: number }[] = [];
    for (const [path, s] of this.docs) {
      if (!path.startsWith("orders/")) continue;
      const reservedUntil = s.data["reservedUntil"];
      if (s.data["paymentStatus"] === "pending_payment" && reservedUntil instanceof Date && reservedUntil.getTime() <= now.getTime()) {
        rows.push({ id: path.slice("orders/".length), at: reservedUntil.getTime() });
      }
    }
    return rows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(0, limit).map((r) => r.id);
  }

  async countPendingOrdersByEmail(email: string, limit: number): Promise<number> {
    let n = 0;
    for (const [path, s] of this.docs) {
      if (!path.startsWith("orders/")) continue;
      const customer = s.data["customer"] as { email?: unknown } | undefined;
      if (s.data["paymentStatus"] === "pending_payment" && customer?.email === email) n++;
    }
    return Math.min(n, limit);
  }

  async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const reads = new Map<string, number>();
      const writes: Write[] = [];
      const tx: Tx = {
        get: async (path) => {
          if (writes.length > 0) throw new Error("Firestore exige hacer todas las lecturas antes de las escrituras");
          await yieldTurn();
          const s = this.docs.get(path);
          if (!reads.has(path)) reads.set(path, s?.version ?? 0);
          return s ? structuredClone(s.data) : undefined;
        },
        getAll: async (paths) => {
          if (writes.length > 0) throw new Error("Firestore exige hacer todas las lecturas antes de las escrituras");
          await yieldTurn();
          return paths.map((path) => {
            const s = this.docs.get(path);
            if (!reads.has(path)) reads.set(path, s?.version ?? 0);
            return s ? structuredClone(s.data) : undefined;
          });
        },
        create: (path, data) => {
          assertWritable(data, path);
          writes.push({ kind: "create", path, data: structuredClone(data) });
        },
        set: (path, data, options) => {
          assertWritable(data, path);
          writes.push({ kind: "set", path, data: structuredClone(data), merge: options?.merge === true });
        },
        update: (path, patch) => {
          assertWritable(patch, path);
          for (const key of Object.keys(patch)) {
            if (key.includes(".")) throw new Error("update con clave con punto: no soportado por el doble");
          }
          writes.push({ kind: "update", path, data: structuredClone(patch) });
        },
      };

      const result = await fn(tx);
      await yieldTurn();

      // Commit atómico (síncrono): valida versiones leídas y aplica.
      const stale = [...reads].some(([path, version]) => (this.docs.get(path)?.version ?? 0) !== version);
      if (stale) {
        this.retries++;
        continue;
      }
      this.applyWrites(writes);
      return result;
    }
    throw new ContentionError();
  }

  private applyWrites(writes: Write[]): void {
    // Se simula en una copia para que un fallo a mitad (create duplicado, update de algo inexistente)
    // no deje la transacción aplicada a medias.
    const staged = new Map<string, Stored | undefined>();
    const read = (path: string): Stored | undefined => (staged.has(path) ? staged.get(path) : this.docs.get(path));
    for (const w of writes) {
      const current = read(w.path);
      if (w.kind === "create") {
        if (current) throw new Error(`ALREADY_EXISTS: ${w.path}`);
        staged.set(w.path, { data: resolveIncrements({}, w.data), version: 1 });
      } else if (w.kind === "update") {
        if (!current) throw new Error(`NOT_FOUND: ${w.path}`);
        staged.set(w.path, { data: resolveIncrements(current.data, w.data), version: current.version + 1 });
      } else {
        const base = w.merge && current ? current.data : {};
        staged.set(w.path, { data: resolveIncrements(base, w.data), version: (current?.version ?? 0) + 1 });
      }
    }
    for (const [path, s] of staged) {
      if (s) this.docs.set(path, s);
    }
    this.commits++;
  }
}
