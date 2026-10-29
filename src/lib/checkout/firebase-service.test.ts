import { describe, expect, it, vi } from "vitest";
import { createFirebaseOrderService, mapOrderError } from "./firebase-service";
import { OrderServiceError } from "./types";

vi.mock("@/lib/firebase/client", () => ({ callFunction: async () => ({}) }));

const fnError = (code: string, details?: unknown) => Object.assign(new Error("x"), { code: `functions/${code}`, details });

describe("mapOrderError", () => {
  it("usa el código de aplicación con su sku y campos", () => {
    const e = mapOrderError(fnError("failed-precondition", { code: "OUT_OF_STOCK", sku: "A1", available: 0 }));
    expect(e).toBeInstanceOf(OrderServiceError);
    expect(e.code).toBe("OUT_OF_STOCK");
    expect(e.sku).toBe("A1");
    const invalid = mapOrderError(fnError("invalid-argument", { code: "INVALID_INPUT", fields: [{ path: "customer.email", message: "Formato no válido" }] }));
    expect(invalid.fields).toEqual([{ path: "customer.email", message: "Formato no válido" }]);
  });

  it("sin código de aplicación: límites y contención se reconocen; lo demás es INTERNAL", () => {
    expect(mapOrderError(fnError("resource-exhausted")).code).toBe("RATE_LIMITED");
    expect(mapOrderError(fnError("aborted")).code).toBe("CONTENTION");
    expect(mapOrderError(fnError("unavailable")).code).toBe("INTERNAL");
    expect(mapOrderError(new Error("???")).code).toBe("INTERNAL");
  });
});

describe("createFirebaseOrderService", () => {
  it("createFlowPayment solo manda número y token, y exige una URL https de Flow", async () => {
    const invoke = vi.fn(async () => ({ redirectUrl: "https://www.flow.cl/app/web/pay.php?token=T", reservedUntil: "2026-10-23T12:00:00Z" }));
    const service = createFirebaseOrderService(invoke);
    await service.createFlowPayment({ orderNumber: "NE-000001", accessToken: "tok" });
    expect(invoke).toHaveBeenCalledWith("createFlowPayment", { orderNumber: "NE-000001", accessToken: "tok" });

    const bad = createFirebaseOrderService(async () => ({ redirectUrl: "javascript:alert(1)" }));
    await expect(bad.createFlowPayment({ orderNumber: "NE-000001", accessToken: "tok" })).rejects.toMatchObject({ code: "FLOW_UNAVAILABLE" });
  });

  it("los errores de la callable salen como OrderServiceError", async () => {
    const service = createFirebaseOrderService(async () => {
      throw fnError("not-found", { code: "ORDER_NOT_FOUND" });
    });
    await expect(service.getOrderStatus({ orderNumber: "NE-000001", accessToken: "x" })).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});
