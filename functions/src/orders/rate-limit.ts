import { paths, type Clock, type Db } from "../common/db.js";
import { consumeAttempt, rateLimitDoc, readRateWindow } from "./primitives.js";

/** Ventana de los límites de intentos de las funciones públicas (functions.md 3.1 y 3.4). */
export const RATE_WINDOW_MS = 10 * 60_000;

/**
 * Consume un intento del límite `key` (hash) en su propia transacción. Devuelve `false` si ya se
 * alcanzó `max` en la ventana vigente (sin escribir). Una escritura por llamada permitida.
 */
export async function consumeRateLimit(db: Db, clock: Clock, key: string, max: number): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const path = paths.rateLimit(key);
    const state = readRateWindow(await tx.get(path));
    const now = clock();
    const result = consumeAttempt(state, now, RATE_WINDOW_MS, max);
    if (result.allowed) tx.set(path, rateLimitDoc(result.next));
    return result.allowed;
  });
}
