import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { systemClock, type Db } from "../common/db.js";
import { createFirestoreDb } from "../common/firestore-db.js";
import type { FlowCheckResult } from "../orders/release-expired.js";
import type { Deps } from "../orders/tx.js";
import type { OrderDoc } from "../orders/types.js";
import { applyFlowStatus } from "./apply-status.js";
import { resolveFlowConfig, type FlowConfig, type FlowEnvInput } from "./config.js";
import { createFlowClient, FlowApiError, FlowStatus, type FlowClient } from "./flow-client.js";

// Cableado de ejecución (Cloud Functions): secretos, base de datos y cliente de Flow, creados al
// primer uso de cada instancia. Aquí no hay lógica de negocio; está en los módulos puros.
//
// Secretos: `defineSecret` (Secret Manager). Solo hay que listarlos en `secrets: [...]` de las
// funciones que los usan. Parámetros no secretos (APP_ENV, SITE_URL, FLOW_API_BASE,
// FLOW_CONFIRMATION_URL): se leen de `process.env`, que se llena desde `functions/.env.<alias>`.
// (No se usa `defineString` para no duplicar parámetros que otros módulos ya declaran, p. ej. SITE_URL.)

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

export function readFlowEnv(): FlowEnvInput {
  return {
    APP_ENV: process.env["APP_ENV"],
    FLOW_API_BASE: process.env["FLOW_API_BASE"],
    FLOW_CONFIRMATION_URL: process.env["FLOW_CONFIRMATION_URL"],
    SITE_URL: process.env["SITE_URL"],
    FLOW_API_KEY: secretValue(FLOW_API_KEY),
    FLOW_SECRET_KEY: secretValue(FLOW_SECRET_KEY),
  };
}

let cachedFlow: { config: FlowConfig; client: FlowClient } | undefined;

/** Config completa y cliente de Flow. Lanza `FlowConfigError` si la configuración no es válida. */
export function getFlowRuntime(): { config: FlowConfig; client: FlowClient } {
  if (!cachedFlow) {
    const config = resolveFlowConfig(readFlowEnv(), "full");
    cachedFlow = { config, client: createFlowClient({ apiBase: config.apiBase, apiKey: config.apiKey, secretKey: config.secretKey }) };
  }
  return cachedFlow;
}

/**
 * Proveedor del cliente solo para `getStatus` (config `api`: ambiente, base y claves; sin las URLs).
 * Cachea SOLO el éxito: un fallo de configuración (p. ej. un secreto aún no cargado) no se recuerda,
 * así que al corregirlo la misma instancia se recupera sin reiniciarse (M4, QA). Devuelve `undefined`
 * si la configuración no es válida; el llamador decide qué hacer.
 */
export function makeApiClientProvider(readEnv: () => FlowEnvInput): () => FlowClient | undefined {
  let cached: FlowClient | undefined;
  return () => {
    if (cached) return cached;
    try {
      const c = resolveFlowConfig(readEnv(), "api");
      cached = createFlowClient({ apiBase: c.apiBase, apiKey: c.apiKey, secretKey: c.secretKey });
      return cached;
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
export const getFlowApiClient: () => FlowClient | undefined = makeApiClientProvider(readFlowEnv);

/** Para `flowConfirm`: lanza si no hay configuración válida (la respuesta es 500 y Flow reintenta). */
export function requireFlowApiClient(): FlowClient {
  const client = getFlowApiClient();
  if (!client) throw new Error("Configuración de Flow no válida");
  return client;
}

/** Reconciliación de `getOrderStatus`: consulta `getStatus` y aplica la rutina de `flowConfirm`. */
export function makeReconcile(deps: Deps, getClient: () => FlowClient | undefined): (order: OrderDoc) => Promise<void> {
  return async (order) => {
    const client = getClient();
    const token = order.flow?.token;
    if (!client || !token) return;
    const status = await client.getStatus(token);
    await applyFlowStatus(deps, token, status);
  };
}

/** Comprobación previa a expirar un pedido de Flow (`releaseExpiredReservations`). */
export function makeCheckFlowPaid(deps: Deps, getClient: () => FlowClient | undefined): (order: OrderDoc) => Promise<FlowCheckResult> {
  return async (order) => {
    const client = getClient();
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
