import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { appError, invalidInputFromZod } from "../common/errors.js";

// Credenciales de Flow editables desde el admin (D-035). Viven SOLO en Secret Manager: el admin
// escribe una versión nueva de cada secreto y las funciones de pago leen la última versión, con una
// caché corta por instancia. Los valores nunca se guardan en Firestore, nunca vuelven al navegador
// y nunca se registran en los logs. Lógica pura: el acceso a Secret Manager llega inyectado.

export const FLOW_SECRET_NAMES = { apiKey: "FLOW_API_KEY", secretKey: "FLOW_SECRET_KEY" } as const;
export type FlowSecretName = (typeof FLOW_SECRET_NAMES)[keyof typeof FLOW_SECRET_NAMES];

/** Tiempo que una instancia reutiliza la última versión leída antes de volver a consultarla. */
export const SECRET_CACHE_TTL_MS = 60_000;

/** Acceso mínimo a Secret Manager que necesitamos (la implementación real está en secret-store.ts). */
export interface SecretStore {
  /** Valor de la última versión habilitada, o `undefined` si el secreto no tiene ninguna. */
  accessLatest(name: FlowSecretName): Promise<string | undefined>;
  /** Fecha (ISO) de la última versión habilitada, o `null` si no hay. No lee el valor. */
  latestCreatedAt(name: FlowSecretName): Promise<string | null>;
  /** Agrega una versión nueva (pasa a ser la última). */
  addVersion(name: FlowSecretName, value: string): Promise<void>;
}

/** Errores de Secret Manager que el admin puede resolver; los demás salen como `INTERNAL`. */
export class SecretStoreError extends Error {
  constructor(readonly kind: "not_found" | "permission_denied") {
    super(`Secret Manager: ${kind}`);
    this.name = "SecretStoreError";
  }
}

export interface LatestSecretReader {
  (name: FlowSecretName): Promise<string | undefined>;
  /** Olvida lo leído (tras guardar credenciales nuevas en esta misma instancia). */
  invalidate(): void;
}

/**
 * Lector de la última versión con caché por nombre. Si Secret Manager falla, se sigue usando el
 * último valor bueno (si lo hay) para no cortar los pagos por un error pasajero.
 */
export function makeLatestSecretReader(store: Pick<SecretStore, "accessLatest">, ttlMs = SECRET_CACHE_TTL_MS, now: () => number = Date.now): LatestSecretReader {
  const cache = new Map<FlowSecretName, { value: string | undefined; at: number }>();
  const read = async (name: FlowSecretName): Promise<string | undefined> => {
    const hit = cache.get(name);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    try {
      const value = await store.accessLatest(name);
      cache.set(name, { value, at: now() });
      return value;
    } catch (err) {
      logger.warn("No se pudo leer un secreto de Flow; se usa el último valor conocido", {
        secret: name,
        errorName: err instanceof Error ? err.name : typeof err,
      });
      return hit?.value;
    }
  };
  return Object.assign(read, { invalidate: () => cache.clear() });
}

// Credenciales de Flow: apiKey (tipo UUID) y secretKey (hex). No se exige un formato exacto, pero sí
// caracteres imprimibles sin espacios y un largo razonable. Los mensajes nunca incluyen el valor.
const credential = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .refine((v) => /^[\x21-\x7E]+$/.test(v), { message: "Solo letras, números y símbolos, sin espacios" });

export const setFlowCredentialsSchema = z
  .strictObject({ apiKey: credential.optional(), secretKey: credential.optional() })
  .refine((d) => d.apiKey !== undefined || d.secretKey !== undefined, { message: "Indica al menos una credencial" });

export interface FlowCredentialStatus {
  configured: boolean;
  updatedAt: string | null;
}

export interface FlowCredentialsStatus {
  apiKey: FlowCredentialStatus & { /** Últimos 4 caracteres, para reconocerla. La secretKey nunca se muestra. */ hint: string | null };
  secretKey: FlowCredentialStatus;
}

async function statusOf(store: SecretStore, name: FlowSecretName): Promise<FlowCredentialStatus> {
  const updatedAt = await store.latestCreatedAt(name);
  return { configured: updatedAt !== null, updatedAt };
}

/** `getFlowCredentialsStatus`: solo admin. Dice si cada credencial existe y cuándo cambió; nunca el valor. */
export async function handleGetFlowCredentialsStatus(store: SecretStore): Promise<FlowCredentialsStatus> {
  try {
    const [apiKey, secretKey, apiKeyValue] = await Promise.all([
      statusOf(store, FLOW_SECRET_NAMES.apiKey),
      statusOf(store, FLOW_SECRET_NAMES.secretKey),
      store.accessLatest(FLOW_SECRET_NAMES.apiKey),
    ]);
    return { apiKey: { ...apiKey, hint: apiKeyValue && apiKeyValue.length >= 8 ? apiKeyValue.slice(-4) : null }, secretKey };
  } catch (err) {
    throw storeError(err);
  }
}

/** `setFlowCredentials`: solo admin. Entrada `{ apiKey?, secretKey? }`; al menos una. */
export async function handleSetFlowCredentials(
  store: SecretStore,
  data: unknown,
  uid: string,
  onSaved: () => void = () => undefined,
): Promise<FlowCredentialsStatus> {
  const parsed = setFlowCredentialsSchema.safeParse(data);
  if (!parsed.success) throw invalidInputFromZod(parsed.error);
  const { apiKey, secretKey } = parsed.data;
  const saved: FlowSecretName[] = [];
  try {
    if (apiKey !== undefined) {
      await store.addVersion(FLOW_SECRET_NAMES.apiKey, apiKey);
      saved.push(FLOW_SECRET_NAMES.apiKey);
    }
    if (secretKey !== undefined) {
      await store.addVersion(FLOW_SECRET_NAMES.secretKey, secretKey);
      saved.push(FLOW_SECRET_NAMES.secretKey);
    }
  } catch (err) {
    throw storeError(err);
  } finally {
    // Auditoría: quién y qué secretos, nunca los valores.
    if (saved.length > 0) {
      onSaved();
      logger.info("Credenciales de Flow actualizadas", { uid, secrets: saved });
    }
  }
  return handleGetFlowCredentialsStatus(store);
}

function storeError(err: unknown): Error {
  if (err instanceof SecretStoreError) {
    return appError(err.kind === "not_found" ? "FLOW_SECRET_MISSING" : "FLOW_SECRET_FORBIDDEN");
  }
  return err instanceof Error ? err : new Error(String(err));
}
