import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { systemClock, type Db } from "../common/db.js";
import { createFirestoreDb } from "../common/firestore-db.js";
import type { FlowCheckResult } from "../orders/release-expired.js";
import type { Deps } from "../orders/tx.js";
import type { OrderDoc } from "../orders/types.js";
import { applyFlowStatus } from "./apply-status.js";
import { resolveFlowConfig, type FlowConfig, type FlowEnvInput } from "./config.js";
import { FLOW_SECRET_NAMES, makeLatestSecretReader, type FlowSecretName, type SecretStore } from "./credentials.js";
import { createFlowClient, FlowApiError, FlowStatus, type FlowClient } from "./flow-client.js";
import { createSecretManagerStore } from "./secret-store.js";

// Cableado de ejecución (Cloud Functions): secretos, base de datos y cliente de Flow, creados al
// primer uso de cada instancia. Aquí no hay lógica de negocio; está en los módulos puros.
//
// Secretos: `defineSecret` (Secret Manager). Solo hay que listarlos en `secrets: [...]` de las
// funciones que los usan. Parámetros no secretos (APP_ENV, SITE_URL, FLOW_API_BASE,
// FLOW_CONFIRMATION_URL): se leen de `process.env`, que se llena desde `functions/.env.<alias>`.
// (No se usa `defineString` para no duplicar parámetros que otros módulos ya declaran, p. ej. SITE_URL.)
//
// Credenciales editables desde el admin (D-035): el despliegue fija una versión de cada secreto,
// así que en la nube se lee además la ÚLTIMA versión desde Secret Manager (caché de 60 s por
// instancia) y la versión fijada queda como respaldo. En local (emulador) solo se usa la fijada.

export const FLOW_API_KEY = defineSecret("FLOW_API_KEY");
export const FLOW_SECRET_KEY = defineSecret("FLOW_SECRET_KEY");
export const FLOW_SECRETS = [FLOW_API_KEY, FLOW_SECRET_KEY];

let cachedDb: Db | undefined;
export const getDb = (): Db => (cachedDb ??= createFirestoreDb());

export const getDeps = (): Deps => ({ db: getDb(), clock: systemClock });

function secretValue(secret: { value(): string }): string | undefined {
  try {
    const v = secret.value();
    return v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

const isLocal = (): boolean => process.env["APP_ENV"] === "local";

let cachedStore: SecretStore | undefined;
/** Secret Manager del proyecto actual; `undefined` en local o si no se conoce el proyecto. */
export function getSecretStore(): SecretStore | undefined {
  const projectId = process.env["GCLOUD_PROJECT"];
  if (isLocal() || !projectId) return undefined;
  return (cachedStore ??= createSecretManagerStore(projectId));
}

const latestSecret = makeLatestSecretReader({ accessLatest: async (name) => getSecretStore()?.accessLatest(name) });

/** Olvida los secretos leídos por esta instancia (tras `setFlowCredentials`). */
export const invalidateFlowSecrets = (): void => latestSecret.invalidate();

async function flowSecret(name: FlowSecretName, bound: { value(): string }): Promise<string | undefined> {
  if (isLocal()) return secretValue(bound);
  return (await latestSecret(name)) ?? secretValue(bound);
}

export async function readFlowEnv(): Promise<FlowEnvInput> {
  const [apiKey, secretKey] = await Promise.all([
    flowSecret(FLOW_SECRET_NAMES.apiKey, FLOW_API_KEY),
    flowSecret(FLOW_SECRET_NAMES.secretKey, FLOW_SECRET_KEY),
  ]);
  return {
    APP_ENV: process.env["APP_ENV"],
    FLOW_API_BASE: process.env["FLOW_API_BASE"],
    FLOW_CONFIRMATION_URL: process.env["FLOW_CONFIRMATION_URL"],
    SITE_URL: process.env["SITE_URL"],
    FLOW_API_KEY: apiKey,
    FLOW_SECRET_KEY: secretKey,
  };
}

/** Reutiliza el cliente mientras no cambien la base ni las claves. */
function makeClientCache(): (c: FlowConfig) => FlowClient {
  let cached: { config: FlowConfig; client: FlowClient } | undefined;
  return (c) => {
    const same = cached && cached.config.apiBase === c.apiBase && cached.config.apiKey === c.apiKey && cached.config.secretKey === c.secretKey;
    if (!same) cached = { config: c, client: createFlowClient({ apiBase: c.apiBase, apiKey: c.apiKey, secretKey: c.secretKey }) };
    return cached!.client;
  };
}

const fullClient = makeClientCache();

/** Config completa y cliente de Flow. Lanza `FlowConfigError` si la configuración no es válida. */
export async function getFlowRuntime(): Promise<{ config: FlowConfig; client: FlowClient }> {
  const config = resolveFlowConfig(await readFlowEnv(), "full");
  return { config, client: fullClient(config) };
}

/**
 * Proveedor del cliente solo para `getStatus` (config `api`: ambiente, base y claves; sin las URLs).
 * Relee la configuración en cada uso (los secretos tienen su propia caché) y reutiliza el cliente
 * mientras las claves no cambien. Así un fallo de configuración no se recuerda (M4, QA) y unas
 * credenciales nuevas guardadas desde el admin se aplican sin reiniciar (D-035). Devuelve
 * `undefined` si la configuración no es válida; el llamador decide qué hacer.
 */
export function makeApiClientProvider(readEnv: () => FlowEnvInput | Promise<FlowEnvInput>): () => Promise<FlowClient | undefined> {
  const clientFor = makeClientCache();
  return async () => {
    try {
      return clientFor(resolveFlowConfig(await readEnv(), "api"));
    } catch (err) {
      logger.warn("Flow no está configurado; no se puede consultar a Flow", { errorName: err instanceof Error ? err.name : typeof err });
      return undefined;
    }
  };
}

/**
 * Cliente solo para consultar `getStatus` (reconciliación y expiración). `undefined` si la
 * configuración de Flow no es válida: en ese caso esas rutas siguen funcionando sin Flow.
 */
export const getFlowApiClient: () => Promise<FlowClient | undefined> = makeApiClientProvider(readFlowEnv);

/** Para `flowConfirm`: lanza si no hay configuración válida (la respuesta es 500 y Flow reintenta). */
export async function requireFlowApiClient(): Promise<FlowClient> {
  const client = await getFlowApiClient();
  if (!client) throw new Error("Configuración de Flow no válida");
  return client;
}

/** Reconciliación de `getOrderStatus`: consulta `getStatus` y aplica la rutina de `flowConfirm`. */
type ClientGetter = () => FlowClient | undefined | Promise<FlowClient | undefined>;

export function makeReconcile(deps: Deps, getClient: ClientGetter): (order: OrderDoc) => Promise<void> {
  return async (order) => {
    const client = await getClient();
    const token = order.flow?.token;
    if (!client || !token) return;
    const status = await client.getStatus(token);
    await applyFlowStatus(deps, token, status);
  };
}

/** Comprobación previa a expirar un pedido de Flow (`releaseExpiredReservations`). */
export function makeCheckFlowPaid(deps: Deps, getClient: ClientGetter): (order: OrderDoc) => Promise<FlowCheckResult> {
  return async (order) => {
    const client = await getClient();
    const token = order.flow?.token;
    if (!client || !token) return "error";
    try {
      const status = await client.getStatus(token);
      if (status.status !== FlowStatus.PAID) return "not_paid";
      const result = await applyFlowStatus(deps, token, status);
      return result.kind === "processed" ? "paid_applied" : "not_paid";
    } catch (err) {
      if (!(err instanceof FlowApiError)) logger.error("Comprobación de Flow falló", { errorName: err instanceof Error ? err.name : typeof err });
      return "error";
    }
  };
}
