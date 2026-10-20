import { onCall, onRequest } from "firebase-functions/v2/https";
import { callableSecurityOptions } from "../common/auth.js";
import { toHttpsError } from "../common/errors.js";
import { handleCreateFlowPayment } from "./create-payment.js";
import { handleFlowConfirm } from "./flow-confirm.js";
import { FLOW_SECRETS, getDeps, getFlowRuntime } from "./runtime.js";

// Funciones de Flow expuestas (functions.md 3.2 y 3.3). Región us-east4 por `setGlobalOptions`.

/** Inicio del pago: público (número + token) + App Check. */
export const createFlowPayment = onCall(
  { ...callableSecurityOptions(), memory: "256MiB", timeoutSeconds: 30, maxInstances: 10, secrets: FLOW_SECRETS },
  async (request) => {
    try {
      const deps = getDeps();
      return await handleCreateFlowPayment(
        { ...deps, getFlow: () => getFlowRuntime().client, getConfig: () => getFlowRuntime().config },
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
      { ...getDeps(), getFlow: () => getFlowRuntime().client },
      { method: req.method, body: req.body },
    );
    if (result.allow) res.set("Allow", result.allow);
    res.status(result.status).send();
  },
);
