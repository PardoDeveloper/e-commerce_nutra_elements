// Puerto mínimo de Firestore para las funciones de pedidos, pagos y métricas (tarea B1).
// La lógica de dinero y stock habla solo con esta interfaz; hay dos implementaciones:
//  - `firestore-db.ts`: Admin SDK (la única parte que toca Firestore real).
//  - `testing/memory-db.ts`: doble en memoria para tests unitarios (D-026, sin emuladores).
// Reglas de Firestore que el puerto respeta (y que el doble hace cumplir): en una transacción todas
// las lecturas van antes que las escrituras; no se admite `undefined`; las claves de `update` son de
// primer nivel (sin rutas con puntos).

export type DocData = Record<string, unknown>;

/** Valor especial: suma `n` al campo numérico (equivale a `FieldValue.increment(n)`). */
export interface IncrementOp {
  readonly __op: "increment";
  readonly n: number;
}

export function increment(n: number): IncrementOp {
  if (!Number.isSafeInteger(n)) throw new RangeError("increment exige un entero seguro");
  return { __op: "increment", n };
}

export function isIncrement(value: unknown): value is IncrementOp {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __op?: unknown }).__op === "increment" &&
    typeof (value as { n?: unknown }).n === "number"
  );
}

export interface Tx {
  get(path: string): Promise<DocData | undefined>;
  /** Lee varios documentos; el resultado conserva el orden de `paths`. */
  getAll(paths: readonly string[]): Promise<(DocData | undefined)[]>;
  /** Falla al confirmar si el documento ya existe. */
  create(path: string, data: DocData): void;
  set(path: string, data: DocData, options?: { merge?: boolean }): void;
  /** Falla al confirmar si el documento no existe. Claves de primer nivel. */
  update(path: string, patch: DocData): void;
}

export interface Db {
  /** `fn` puede reintentarse si hay contención: no debe tener efectos fuera de `tx`. */
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Lectura fuera de transacción. */
  get(path: string): Promise<DocData | undefined>;
  /** IDs de pedidos `pending_payment` con `reservedUntil <= now`, los más antiguos primero. */
  listExpiredPendingOrderIds(now: Date, limit: number): Promise<string[]>;
  /** Cantidad (tope `limit`) de pedidos `pending_payment` del correo dado. */
  countPendingOrdersByEmail(email: string, limit: number): Promise<number>;
}

/** Se lanza cuando una transacción agota sus reintentos por contención. */
export class ContentionError extends Error {
  constructor() {
    super("Transacción agotó los reintentos");
    this.name = "ContentionError";
  }
}

/** Reloj inyectable (el tiempo es siempre el del servidor). */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

// Rutas de documentos usadas por varias carpetas.
export const paths = {
  order: (orderNumber: string): string => `orders/${orderNumber}`,
  product: (sku: string): string => `products/${sku}`,
  paymentEvent: (token: string): string => `paymentEvents/${token}`,
  idempotencyKey: (hash: string): string => `idempotencyKeys/${hash}`,
  rateLimit: (hash: string): string => `rateLimits/${hash}`,
  countersOrders: "counters/orders",
  settingsPublic: "settings/public",
  settingsPrivate: "settings/private",
} as const;
