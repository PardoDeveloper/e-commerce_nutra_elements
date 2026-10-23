import { createHmac } from "node:crypto";
import { z } from "zod";

// Cliente de la API REST de Flow. Verificado contra la documentación oficial el 2026-10-19:
//  - https://developers.flow.cl/api  (referencia, Docusaurus + Redoc)
//  - https://developers.flow.cl/es-openApiFlow.yaml  (especificación OpenAPI que alimenta la referencia)
// Lo verificado y lo que NO está en la documentación se detalla en el handoff.
//
// Resumen de la API usada:
//  - Base URL: producción https://www.flow.cl/api ; sandbox https://sandbox.flow.cl/api
//  - POST {base}/payment/create (application/x-www-form-urlencoded). Obligatorios: apiKey,
//    commerceOrder, subject, amount, email, urlConfirmation, urlReturn, s. Opcionales usados:
//    currency, timeout (segundos). Responde 200 {url, token, flowOrder}; el navegador va a
//    `url + "?token=" + token`.
//  - GET {base}/payment/getStatus?apiKey=&token=&s=  -> {flowOrder, commerceOrder, status, amount,
//    currency, ...}. status: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada. Errores: 400 "error del
//    API" y 401 "error de negocio", cuerpo {code, message}.
//  - Firma `s`: parámetros (todos menos `s`) ordenados alfabéticamente por nombre, concatenados como
//    nombre+valor sin separadores, HMAC-SHA256 con la secretKey, en hexadecimal.
//  - Flow notifica a urlConfirmation con POST application/x-www-form-urlencoded y un `token`;
//    el comercio debe llamar a payment/getStatus con ese token.

export const FLOW_SANDBOX_BASE = "https://sandbox.flow.cl/api";
export const FLOW_PRODUCTION_BASE = "https://www.flow.cl/api";

/** Estados de pago de Flow (`status` de getStatus). */
export const FlowStatus = { PENDING: 1, PAID: 2, REJECTED: 3, CANCELLED: 4 } as const;

/** Firma de Flow: HMAC-SHA256 (hex) de nombre+valor de los parámetros ordenados por nombre. */
export function signFlowParams(params: Readonly<Record<string, string>>, secretKey: string): string {
  const toSign = Object.keys(params)
    .filter((k) => k !== "s")
    .sort() // orden ascendente por nombre (todos ASCII)
    .map((k) => `${k}${params[k] ?? ""}`)
    .join("");
  return createHmac("sha256", secretKey).update(toSign, "utf8").digest("hex");
}

/** Cadena exacta que se firma (útil para tests con el ejemplo de la documentación). */
export function flowStringToSign(params: Readonly<Record<string, string>>): string {
  return Object.keys(params)
    .filter((k) => k !== "s")
    .sort()
    .map((k) => `${k}${params[k] ?? ""}`)
    .join("");
}

/**
 * `client`: Flow rechazó la petición (400/401/404...): reintentar igual no sirve.
 * `unavailable`: red, timeout, 429 o 5xx: se puede reintentar.
 */
export class FlowApiError extends Error {
  constructor(
    readonly kind: "client" | "unavailable",
    readonly httpStatus?: number,
    readonly flowCode?: number,
    /** Texto de error que devuelve Flow (sin datos sensibles; truncado). Solo para logs. */
    readonly flowMessage?: string,
  ) {
    super(`Flow ${kind}${httpStatus !== undefined ? ` (HTTP ${httpStatus})` : ""}`);
    this.name = "FlowApiError";
  }
}

export interface FlowPaymentStatus {
  flowOrder: number;
  commerceOrder: string;
  /** 1 pendiente, 2 pagada, 3 rechazada, 4 anulada. */
  status: number;
  amount: number;
  currency: string;
}

export interface CreatePaymentParams {
  commerceOrder: string;
  subject: string;
  currency: "CLP";
  amount: number;
  email: string;
  urlConfirmation: string;
  urlReturn: string;
  /** Segundos hasta que la orden expire en Flow (se alinea con la reserva). */
  timeoutSeconds?: number | undefined;
}

export interface CreatePaymentResult {
  url: string;
  token: string;
  flowOrder: number;
}

export interface FlowClient {
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  getStatus(token: string): Promise<FlowPaymentStatus>;
}

export interface FetchResponseLike {
  status: number;
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

const createResponseSchema = z.object({ url: z.string(), token: z.string().min(1).max(100), flowOrder: z.number() });
const statusResponseSchema = z.object({
  flowOrder: z.number(),
  commerceOrder: z.string(),
  status: z.number().int(),
  // La referencia dice `number`; por si llega como texto ("12000.00") se acepta y se convierte.
  amount: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  currency: z.string(),
});
const errorBodySchema = z.object({ code: z.coerce.number().optional(), message: z.string().optional() });

const DEFAULT_TIMEOUT_MS = 10_000;

function classify(httpStatus: number): "client" | "unavailable" {
  return httpStatus === 429 || httpStatus >= 500 ? "unavailable" : "client";
}

export function createFlowClient(opts: {
  apiBase: string;
  apiKey: string;
  secretKey: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}): FlowClient {
  const base = opts.apiBase.replace(/\/+$/, "");
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call(method: "GET" | "POST", endpoint: string, params: Record<string, string>): Promise<unknown> {
    const signed = { ...params, apiKey: opts.apiKey };
    const s = signFlowParams(signed, opts.secretKey);
    const query = new URLSearchParams({ ...signed, s }).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: FetchResponseLike;
    let bodyText: string;
    try {
      res =
        method === "GET"
          ? await doFetch(`${base}${endpoint}?${query}`, { method, signal: controller.signal })
          : await doFetch(`${base}${endpoint}`, {
              method,
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: query,
              signal: controller.signal,
            });
      bodyText = await res.text();
    } catch {
      // Red, DNS o timeout. No se incluye el error original (podría traer la URL con la firma).
      throw new FlowApiError("unavailable");
    } finally {
      clearTimeout(timer);
    }

    if (res.status < 200 || res.status >= 300) {
      let flowCode: number | undefined;
      let flowMessage: string | undefined;
      try {
        const body = errorBodySchema.parse(JSON.parse(bodyText));
        flowCode = body.code;
        flowMessage = body.message?.slice(0, 200);
      } catch {
        flowCode = undefined;
      }
      throw new FlowApiError(classify(res.status), res.status, flowCode, flowMessage);
    }
    try {
      return JSON.parse(bodyText);
    } catch {
      throw new FlowApiError("unavailable", res.status);
    }
  }

  return {
    async createPayment(p) {
      const params: Record<string, string> = {
        commerceOrder: p.commerceOrder,
        subject: p.subject,
        currency: p.currency,
        amount: String(p.amount),
        email: p.email,
        urlConfirmation: p.urlConfirmation,
        urlReturn: p.urlReturn,
      };
      if (p.timeoutSeconds !== undefined) params["timeout"] = String(p.timeoutSeconds);
      const parsed = createResponseSchema.safeParse(await call("POST", "/payment/create", params));
      if (!parsed.success) throw new FlowApiError("unavailable");
      const url = safeFlowUrl(parsed.data.url);
      if (!url) throw new FlowApiError("unavailable");
      return { url, token: parsed.data.token, flowOrder: parsed.data.flowOrder };
    },
    async getStatus(token) {
      const parsed = statusResponseSchema.safeParse(await call("GET", "/payment/getStatus", { token }));
      if (!parsed.success) throw new FlowApiError("unavailable");
      return parsed.data;
    },
  };
}

/** La URL de pago debe ser https y de un dominio de Flow (no se redirige al comprador a otro lado). */
export function safeFlowUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || !(host === "flow.cl" || host.endsWith(".flow.cl"))) return null;
    return raw;
  } catch {
    return null;
  }
}

/** URL a la que se redirige al comprador: `url + "?token=" + token`. */
export function buildPaymentUrl(url: string, token: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
}
