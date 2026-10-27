import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { callableSecurityOptions } from "../common/auth.js";
import { toHttpsError } from "../common/errors.js";
import { clientIpFrom } from "../orders/client-ip.js";
import { getDeps } from "../payments/runtime.js";
import { handleSubmitContactMessage } from "./submit-message.js";

// Formulario de contacto (functions.md 3.5). Público + App Check fuera del emulador.

function ipOf(request: CallableRequest<unknown>): string | undefined {
  const raw = request.rawRequest;
  return clientIpFrom(raw.headers, raw.ip);
}

export const submitContactMessage = onCall(
  { ...callableSecurityOptions(), memory: "256MiB", timeoutSeconds: 15, maxInstances: 5 },
  async (request) => {
    try {
      return await handleSubmitContactMessage(getDeps(), request.data, { ip: ipOf(request) });
    } catch (err) {
      throw toHttpsError(err);
    }
  },
);
