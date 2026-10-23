import { onCall, onRequest } from "firebase-functions/v2/https";
import { assertAdmin, callableSecurityOptions } from "../common/auth.js";
import { appError, toHttpsError } from "../common/errors.js";
import { clientIpFrom } from "../orders/client-ip.js";
import { handleCreateFlowPayment } from "./create-payment.js";
import { handleGetFlowCredentialsStatus, handleSetFlowCredentials, type FlowCredentialsStatus, type SecretStore } from "./credentials.js";
import { handleFlowConfirm } from "./flow-confirm.js";
import { FLOW_SECRETS, getDeps, getFlowRuntime, getSecretStore, invalidateFlowSecrets, requireFlowApiClient } from "./runtime.js";

// Funciones de Flow expuestas (functions.md 3.2 y 3.3). Región us-east4 por `setGlobalOptions`.

/** Inicio del pago: público (número + token) + App Check. */
export const createFlowPayment = onCall(
  { ...callableSecurityOptions(), memory: "256MiB", timeoutSeconds: 30, maxInstances: 10, secrets: FLOW_SECRETS },
  async (request) => {
    try {
      const deps = getDeps();
      return await handleCreateFlowPayment(
        { ...deps, getFlow: async () => (await getFlowRuntime()).client, getConfig: async () => (await getFlowRuntime()).config },
        request.data,
      );
    } catch (err) {
      throw toHttpsError(err);
    }
  },
);

/**
 * Confirmación de Flow (HTTP). Sin sesión ni App Check (la llama Flow); `invoker: "public"` y se
 * protege validando el token contra Flow con `getStatus` firmado.
 */
export const flowConfirm = onRequest(
  { invoker: "public", cors: false, memory: "256MiB", timeoutSeconds: 30, maxInstances: 10, secrets: FLOW_SECRETS },
  async (req, res) => {
    const result = await handleFlowConfirm(
      // Solo necesita el cliente de la API (getStatus): no exige FLOW_CONFIRMATION_URL ni SITE_URL (M4).
      { ...getDeps(), getFlow: requireFlowApiClient },
      { method: req.method, body: req.body, ip: clientIpFrom(req.headers, req.ip) },
    );
    if (result.allow) res.set("Allow", result.allow);
    res.status(result.status).send();
  },
);

// Credenciales de Flow editables desde el admin (D-035). Solo admin + App Check. Los valores van
// directo a Secret Manager; ninguna de las dos funciones devuelve un secreto.
const CREDENTIALS_OPTIONS = { ...callableSecurityOptions(), memory: "256MiB" as const, timeoutSeconds: 30, maxInstances: 2 };

function requireSecretStore(): SecretStore {
  const store = getSecretStore();
  if (!store) throw appError("FLOW_SECRETS_LOCAL");
  return store;
}

/** Estado de las credenciales: si existen, cuándo cambiaron y los últimos 4 caracteres de la apiKey. */
export const getFlowCredentialsStatus = onCall(CREDENTIALS_OPTIONS, async (request): Promise<FlowCredentialsStatus> => {
  try {
    assertAdmin(request);
    return await handleGetFlowCredentialsStatus(requireSecretStore());
  } catch (err) {
    throw toHttpsError(err);
  }
});

/** Guarda una versión nueva de FLOW_API_KEY y/o FLOW_SECRET_KEY. Entrada `{ apiKey?, secretKey? }`. */
export const setFlowCredentials = onCall(CREDENTIALS_OPTIONS, async (request): Promise<FlowCredentialsStatus> => {
  try {
    const uid = assertAdmin(request);
    return await handleSetFlowCredentials(requireSecretStore(), request.data, uid, invalidateFlowSecrets);
  } catch (err) {
    throw toHttpsError(err);
  }
});
