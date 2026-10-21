import { describe, expect, it } from "vitest";
import {
  buildPaymentUrl,
  createFlowClient,
  flowStringToSign,
  FlowApiError,
  safeFlowUrl,
  signFlowParams,
  type FetchLike,
} from "./flow-client.js";

// La documentación oficial (https://developers.flow.cl/api, sección "¿Cómo firmar con su SecretKey?")
// da estos ejemplos de cadena a firmar. El HMAC-SHA256 hexadecimal con la clave de prueba se
// calculó APARTE con la librería hmac de Python (no con este código), para no validar el código con sí mismo.
const SECRET = "SECRET-KEY-DE-PRUEBA";

describe("firma de Flow (vectores de la documentación)", () => {
  it("ejemplo 1: apiKey, currency y amount se ordenan alfabéticamente", () => {
    const params = { apiKey: "XXXX-XXXX-XXXX", currency: "CLP", amount: "5000" };
    expect(flowStringToSign(params)).toBe("amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP");
    expect(signFlowParams(params, SECRET)).toBe("a582db7b7a303aca2125b5af76fb4a87ae17aefd977ce71c77fa3d33e28ee4fc");
  });

  it("ejemplo 2 (PHP de la documentación): apiKey y token", () => {
    const params = { token: "AJ089FF5467367", apiKey: "1F90971E-8276-4715-97FF-2BLG5030EE3B" };
    expect(flowStringToSign(params)).toBe("apiKey1F90971E-8276-4715-97FF-2BLG5030EE3BtokenAJ089FF5467367");
    expect(signFlowParams(params, SECRET)).toBe("44880ac32d204f8e3773f7c36407d0de9c3ad93bff930a79e62954c590da0968");
  });

  it("el parámetro s no entra en la firma y el orden de las claves no importa", () => {
    const a = signFlowParams({ a: "1", b: "2" }, SECRET);
    expect(signFlowParams({ b: "2", a: "1" }, SECRET)).toBe(a);
    expect(signFlowParams({ a: "1", b: "2", s: "cualquiera" }, SECRET)).toBe(a);
  });

  it("cambiar un valor o la clave cambia la firma", () => {
    const base = signFlowParams({ amount: "5000" }, SECRET);
    expect(signFlowParams({ amount: "5001" }, SECRET)).not.toBe(base);
    expect(signFlowParams({ amount: "5000" }, "otra-clave")).not.toBe(base);
  });

  it("ordena en orden ASCII (mayúsculas antes que minúsculas), como sort() de PHP", () => {
    expect(flowStringToSign({ b: "1", B: "2", a: "3" })).toBe("B2a3b1");
  });
});

interface Captured {
  url: string;
  method: string;
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
}

function fakeFetch(status: number, body: unknown, captured: Captured[] = []): FetchLike {
  return async (url, init) => {
    captured.push({ url, method: init.method, headers: init.headers, body: init.body });
    return { status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  };
}

const client = (fetch: FetchLike) =>
  createFlowClient({ apiBase: "https://sandbox.flow.cl/api/", apiKey: "API-KEY", secretKey: SECRET, fetch });

describe("createPayment", () => {
  const params = {
    commerceOrder: "NE-000123",
    subject: "Pedido NE-000123 - Nutra Elements",
    currency: "CLP" as const,
    amount: 32762,
    email: "ana@example.com",
    urlConfirmation: "https://example.test/flowConfirm",
    urlReturn: "https://example.test/checkout/retorno?o=NE-000123&t=abc",
    timeoutSeconds: 1800,
  };

  it("hace POST form-urlencoded a /payment/create con los parámetros firmados", async () => {
    const calls: Captured[] = [];
    const flow = client(fakeFetch(200, { url: "https://sandbox.flow.cl/app/web/pay.php", token: "TOK123", flowOrder: 99 }, calls));
    const res = await flow.createPayment(params);
    expect(res).toEqual({ url: "https://sandbox.flow.cl/app/web/pay.php", token: "TOK123", flowOrder: 99 });

    const call = calls[0];
    expect(call?.method).toBe("POST");
    expect(call?.url).toBe("https://sandbox.flow.cl/api/payment/create");
    expect(call?.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
    const sent = new URLSearchParams(call?.body);
    expect(Object.fromEntries(sent)).toMatchObject({
      apiKey: "API-KEY",
      commerceOrder: "NE-000123",
      subject: "Pedido NE-000123 - Nutra Elements",
      currency: "CLP",
      amount: "32762",
      email: "ana@example.com",
      urlConfirmation: params.urlConfirmation,
      urlReturn: params.urlReturn,
      timeout: "1800",
    });
    // La firma se calcula sobre los valores SIN codificar y todos los parámetros menos `s`.
    const { s, ...rest } = Object.fromEntries(sent);
    expect(s).toBe(signFlowParams(rest as Record<string, string>, SECRET));
    expect(Object.keys(rest).sort()).toEqual(["amount", "apiKey", "commerceOrder", "currency", "email", "subject", "timeout", "urlConfirmation", "urlReturn"]);
  });

  it("sin timeout no lo envía", async () => {
    const calls: Captured[] = [];
    const flow = client(fakeFetch(200, { url: "https://sandbox.flow.cl/x", token: "T", flowOrder: 1 }, calls));
    const { timeoutSeconds: _t, ...noTimeout } = params;
    void _t;
    await flow.createPayment(noTimeout);
    expect(new URLSearchParams(calls[0]?.body).has("timeout")).toBe(false);
  });

  it("rechaza una URL de pago que no sea https de flow.cl (no se redirige al comprador a otro sitio)", async () => {
    for (const url of ["http://sandbox.flow.cl/x", "https://evil.example.com/x", "https://flow.cl.evil.com/x", "no-es-url"]) {
      const flow = client(fakeFetch(200, { url, token: "T", flowOrder: 1 }));
      await expect(flow.createPayment(params)).rejects.toMatchObject({ name: "FlowApiError", kind: "unavailable" });
    }
  });

  it("errores 400/401 son 'client' (con código de Flow); 429 y 5xx son 'unavailable'", async () => {
    await expect(client(fakeFetch(400, { code: 105, message: "x" })).createPayment(params)).rejects.toMatchObject({ kind: "client", httpStatus: 400, flowCode: 105 });
    await expect(client(fakeFetch(401, { code: 1620, message: "x" })).createPayment(params)).rejects.toMatchObject({ kind: "client", httpStatus: 401 });
    await expect(client(fakeFetch(429, "")).createPayment(params)).rejects.toMatchObject({ kind: "unavailable" });
    await expect(client(fakeFetch(503, "")).createPayment(params)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("red caída, JSON inválido o respuesta con forma inesperada son 'unavailable'", async () => {
    const down: FetchLike = async () => {
      throw new Error("ECONNRESET https://sandbox.flow.cl/api?apiKey=SECRETO&s=firma");
    };
    const err = await client(down).createPayment(params).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FlowApiError);
    expect((err as FlowApiError).kind).toBe("unavailable");
    expect(String((err as FlowApiError).message)).not.toContain("SECRETO"); // no filtra la URL con credenciales
    await expect(client(fakeFetch(200, "no-json")).createPayment(params)).rejects.toMatchObject({ kind: "unavailable" });
    await expect(client(fakeFetch(200, { hola: 1 })).createPayment(params)).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("getStatus", () => {
  const body = { flowOrder: 3567899, commerceOrder: "NE-000123", requestDate: "2026-10-20 12:00:00", status: 2, subject: "x", currency: "CLP", amount: 32762, payer: "ana@example.com" };

  it("hace GET a /payment/getStatus con apiKey, token y firma s", async () => {
    const calls: Captured[] = [];
    const res = await client(fakeFetch(200, body, calls)).getStatus("TOK123");
    expect(res).toEqual({ flowOrder: 3567899, commerceOrder: "NE-000123", status: 2, amount: 32762, currency: "CLP" });
    const call = calls[0];
    expect(call?.method).toBe("GET");
    const url = new URL(call?.url ?? "");
    expect(url.origin + url.pathname).toBe("https://sandbox.flow.cl/api/payment/getStatus");
    expect(call?.body).toBeUndefined();
    const q = Object.fromEntries(url.searchParams);
    expect(q).toMatchObject({ apiKey: "API-KEY", token: "TOK123" });
    expect(q["s"]).toBe(signFlowParams({ apiKey: "API-KEY", token: "TOK123" }, SECRET));
  });

  it("acepta el monto como texto ('32762.00')", async () => {
    const res = await client(fakeFetch(200, { ...body, amount: "32762.00" })).getStatus("T");
    expect(res.amount).toBe(32762);
  });

  it("un token que Flow no reconoce (400/401) es error 'client'", async () => {
    await expect(client(fakeFetch(400, { code: 400, message: "Bad Request" })).getStatus("X")).rejects.toMatchObject({ kind: "client" });
  });

  it("falta de campos obligatorios -> unavailable (no se confía en datos incompletos)", async () => {
    await expect(client(fakeFetch(200, { flowOrder: 1 })).getStatus("X")).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("utilidades", () => {
  it("buildPaymentUrl: url + ?token= + token", () => {
    expect(buildPaymentUrl("https://sandbox.flow.cl/app/web/pay.php", "TOK")).toBe("https://sandbox.flow.cl/app/web/pay.php?token=TOK");
    expect(buildPaymentUrl("https://sandbox.flow.cl/p?x=1", "T K")).toBe("https://sandbox.flow.cl/p?x=1&token=T%20K");
  });
  it("safeFlowUrl", () => {
    expect(safeFlowUrl("https://www.flow.cl/app/web/pay.php")).not.toBeNull();
    expect(safeFlowUrl("https://flow.cl/x")).not.toBeNull();
    expect(safeFlowUrl("https://api.flow.cl")).not.toBeNull();
    expect(safeFlowUrl("https://notflow.cl/x")).toBeNull();
  });
});
