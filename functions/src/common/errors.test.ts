import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { appError, fieldsFromZodError, getAppErrorCode, invalidInputFromZod, toHttpsError } from "./errors.js";

describe("appError", () => {
  it("usa el código estándar y details.code del contrato", () => {
    const e = appError("INVALID_RUT");
    expect(e).toBeInstanceOf(HttpsError);
    expect(e.code).toBe("invalid-argument");
    expect(e.details).toEqual({ code: "INVALID_RUT" });
    expect(e.message).toBe("Revisa tu RUT.");
  });

  it("mapea los códigos principales de la tabla del contrato", () => {
    expect(appError("UNAUTHENTICATED").code).toBe("unauthenticated");
    expect(appError("NOT_ADMIN").code).toBe("permission-denied");
    expect(appError("APP_CHECK_FAILED").code).toBe("failed-precondition");
    expect(appError("RATE_LIMITED").code).toBe("resource-exhausted");
    expect(appError("CONTENTION").code).toBe("aborted");
    expect(appError("INTERNAL").code).toBe("internal");
    expect(appError("OUT_OF_STOCK").code).toBe("failed-precondition");
    expect(appError("INVALID_COMMUNE").code).toBe("invalid-argument");
    expect(appError("ORDER_NOT_FOUND").code).toBe("not-found");
    expect(appError("FLOW_UNAVAILABLE").code).toBe("unavailable");
  });

  it("incluye sku y available solo cuando se entregan", () => {
    expect(appError("OUT_OF_STOCK", { sku: "123", available: 0 }).details).toEqual({
      code: "OUT_OF_STOCK",
      sku: "123",
      available: 0,
    });
  });

  it("recorta la lista de campos", () => {
    const fields = Array.from({ length: 50 }, (_, i) => ({ path: `a${i}`, message: "x" }));
    const e = appError("INVALID_INPUT", { fields });
    expect((e.details as { fields: unknown[] }).fields).toHaveLength(20);
  });
});

describe("getAppErrorCode", () => {
  it("devuelve el código de aplicación o undefined", () => {
    expect(getAppErrorCode(appError("NOT_ADMIN"))).toBe("NOT_ADMIN");
    expect(getAppErrorCode(new HttpsError("internal", "x"))).toBeUndefined();
    expect(getAppErrorCode(new HttpsError("internal", "x", { code: "OTRO" }))).toBeUndefined();
    expect(getAppErrorCode(new Error("x"))).toBeUndefined();
  });
});

describe("toHttpsError", () => {
  it("deja pasar los HttpsError", () => {
    const e = appError("NOT_ADMIN");
    expect(toHttpsError(e)).toBe(e);
  });

  it("oculta el detalle de errores desconocidos", () => {
    const e = toHttpsError(new Error("fallo con rut 12345678-5 en orders/NE-1"));
    expect(e.code).toBe("internal");
    expect(e.message).not.toContain("12345678");
    expect(JSON.stringify(e.details)).toBe('{"code":"INTERNAL"}');
  });
});

describe("fieldsFromZodError", () => {
  it("no repite los valores recibidos ni los nombres de claves desconocidas", () => {
    const schema = z.strictObject({ email: z.string().email(), qty: z.number().int().min(1) });
    const r = schema.safeParse({ email: "secreto@x", qty: 0, precio: 1 });
    expect(r.success).toBe(false);
    if (r.success) return;
    const fields = fieldsFromZodError(r.error);
    const text = JSON.stringify(fields);
    expect(text).not.toContain("secreto");
    expect(text).not.toContain("precio");
    expect(fields.map((f) => f.path).sort()).toContain("qty");
    const e = invalidInputFromZod(r.error);
    expect(e.code).toBe("invalid-argument");
    expect((e.details as { code: string }).code).toBe("INVALID_INPUT");
  });
});
