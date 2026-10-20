import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { normalizeSiteUrl, sendRevalidation, signRevalidation } from "./revalidate.js";

const plan = { paths: ["/productos"], tags: ["catalog"] };
const fixedNow = () => 1_700_000_000_000;
const noSleep = vi.fn(async () => undefined);

function res(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

describe("signRevalidation", () => {
  it("HMAC-SHA256 hex de timestamp.cuerpo", () => {
    const expected = createHmac("sha256", "s3").update('1700000000.{"a":1}').digest("hex");
    expect(signRevalidation("s3", "1700000000", '{"a":1}')).toBe(expected);
  });
});

describe("normalizeSiteUrl", () => {
  it("acepta https y http solo en localhost; quita rutas", () => {
    expect(normalizeSiteUrl("https://nutraelements.cl/")).toBe("https://nutraelements.cl");
    expect(normalizeSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeSiteUrl("http://ejemplo.cl")).toBeNull();
    expect(normalizeSiteUrl("")).toBeNull();
    expect(normalizeSiteUrl(undefined)).toBeNull();
    expect(normalizeSiteUrl("no es url")).toBeNull();
  });
});

describe("sendRevalidation", () => {
  it("sin SITE_URL: omite sin llamar ni lanzar", async () => {
    const fetchFn = vi.fn();
    expect(await sendRevalidation("", "sec", plan, "t", { fetchFn: fetchFn as unknown as typeof fetch })).toBe("skipped");
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("sin secreto: omite", async () => {
    const fetchFn = vi.fn();
    expect(await sendRevalidation("https://x.cl", "", plan, "t", { fetchFn: fetchFn as unknown as typeof fetch })).toBe("skipped");
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("envía POST firmado con las cabeceras del contrato", async () => {
    const fetchFn = vi.fn(async (_url: string, _init: RequestInit) => res(200));
    const out = await sendRevalidation("https://x.cl/", "sec", plan, "t", {
      fetchFn: fetchFn as unknown as typeof fetch,
      now: fixedNow,
      sleep: noSleep,
    });
    expect(out).toBe("ok");
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://x.cl/api/revalidate");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-ne-timestamp"]).toBe("1700000000");
    expect(headers["x-ne-signature"]).toBe(signRevalidation("sec", "1700000000", init.body as string));
    expect(JSON.parse(init.body as string)).toEqual({ paths: ["/productos"], tags: ["catalog"] });
  });
  it("reintenta ante 500 y error de red, hasta 3 intentos, y no lanza", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("red");
    });
    const sleep = vi.fn(async () => undefined);
    const out = await sendRevalidation("https://x.cl", "sec", plan, "t", { fetchFn: fetchFn as unknown as typeof fetch, sleep });
    expect(out).toBe("failed");
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("se recupera en el segundo intento tras 503", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    const out = await sendRevalidation("https://x.cl", "sec", plan, "t", { fetchFn: fetchFn as unknown as typeof fetch, sleep: noSleep });
    expect(out).toBe("ok");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it("no reintenta ante 401/400", async () => {
    const fetchFn = vi.fn(async () => res(401));
    const out = await sendRevalidation("https://x.cl", "sec", plan, "t", { fetchFn: fetchFn as unknown as typeof fetch, sleep: noSleep });
    expect(out).toBe("failed");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
