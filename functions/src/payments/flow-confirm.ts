import * as logger from "firebase-functions/logger";
import { paths } from "../common/db.js";
import { getAppErrorCode } from "../common/errors.js";
import { rateLimitKey } from "../orders/primitives.js";
import { consumeRateLimit } from "../orders/rate-limit.js";
import { parsePrivateSettings } from "../orders/settings.js";
import type { Deps } from "../orders/tx.js";
import { applyFlowStatus, FLOW_TOKEN_REGEX } from "./apply-status.js";
import { FlowApiError, type FlowClient } from "./flow-client.js";

// flowConfirm (functions.md 3.3): endpoint HTTP que Flow llama (POST application/x-www-form-urlencoded
// con `token`). No se confía en nada del cuerpo salvo el token, que se valida contra Flow con
// `getStatus` firmado. Respuestas: 405 método, 400 token inválido/desconocido, 500 fallo interno o de
// red (Flow reintenta; su política de reintentos NO está en la documentación), 429 límite por IP
// superado, 200 procesado. Un token con forma inválida se rechaza sin tocar Firestore ni Flow.

export interface FlowConfirmDeps extends Deps {
  /** Cliente de Flow (solo `getStatus`); puede lanzar si la configuración no es válida (se responde 500). */
  getFlow: () => FlowClient | Promise<FlowClient>;
}

export interface HttpRequestLike {
  method: string;
  body?: unknown;
  /** IP del cliente ya extraída; sin IP no se aplica el límite (se registra). */
  ip?: string | undefined;
}

export interface HttpResult {
  status: 200 | 400 | 405 | 429 | 500;
  /** Cabecera `Allow` para el 405. */
  allow?: string;
}

function extractToken(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const token = (body as { token?: unknown }).token;
  return typeof token === "string" && FLOW_TOKEN_REGEX.test(token) ? token : undefined;
}

export async function handleFlowConfirm(deps: FlowConfirmDeps, req: HttpRequestLike): Promise<HttpResult> {
  if (req.method !== "POST") return { status: 405, allow: "POST" };
  const token = extractToken(req.body);
  if (!token) return { status: 400 };

  try {
    // Límite por IP (M1): evita que un tercero use el endpoint público para gastar llamadas a Flow.
    if (req.ip) {
      const { limits } = parsePrivateSettings(await deps.db.get(paths.settingsPrivate));
      const allowed = await consumeRateLimit(deps.db, deps.clock, rateLimitKey("flowConfirm", req.ip), limits.flowConfirmPerIpPer10Min);
      if (!allowed) {
        logger.warn("flowConfirm: límite por IP superado");
        return { status: 429 };
      }
    } else {
      logger.warn("flowConfirm sin IP: no se aplica el límite por IP");
    }

    const status = await (await deps.getFlow()).getStatus(token);
    const result = await applyFlowStatus(deps, token, status);
    if (result.kind === "order_not_found") {
      logger.warn("Confirmación de Flow para un pedido desconocido");
      return { status: 400 };
    }
    return { status: 200 };
  } catch (err) {
    if (err instanceof FlowApiError && err.kind === "client") {
      // Flow no reconoce el token (o las credenciales no sirven): reintentar no ayuda.
      logger.warn("getStatus rechazado por Flow", { httpStatus: err.httpStatus, flowCode: err.flowCode });
      return { status: 400 };
    }
    // Error de red/Flow/Firestore/configuración: 500 para que Flow reintente. Sin mensaje (puede traer datos).
    logger.error("flowConfirm falló", {
      errorName: err instanceof Error ? err.name : typeof err,
      appCode: getAppErrorCode(err),
    });
    return { status: 500 };
  }
}
