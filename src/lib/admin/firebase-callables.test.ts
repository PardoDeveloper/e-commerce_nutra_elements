import { describe, expect, it, vi } from "vitest";
import { AdminServiceError } from "./errors";
import { createCatalogCallables, createOrderCallables, FUNCTION_UNAVAILABLE_MESSAGE, mapCallableError } from "./firebase-callables";

const report = {
  importId: "i1",
  dryRun: false,
  rows: 3,
  created: 0,
  updated: 2,
  unchanged: 0,
  skipped: 1,
  corrected: [],
  invalid: [{ row: 2, sku: "B", code: "ALREADY_DELETED", message: "x" }],
  warnings: [],
  truncated: false,
};

describe("mapCallableError", () => {
  it("una función sin desplegar (not-found sin código de aplicación) da el aviso de función no disponible", () => {
    const e = mapCallableError(Object.assign(new Error("NOT FOUND"), { code: "functions/not-found" }));
    expect(e).toBeInstanceOf(AdminServiceError);
    expect(e.code).toBe("FUNCTION_UNAVAILABLE");
    expect(e.message).toBe(FUNCTION_UNAVAILABLE_MESSAGE);
  });

  it("un not-found de aplicación (ORDER_NOT_FOUND) no se confunde con una función ausente", () => {
    const e = mapCallableError(Object.assign(new Error("not found"), { code: "functions/not-found", details: { code: "ORDER_NOT_FOUND" } }));
    expect(e.code).toBe("ORDER_NOT_FOUND");
    expect(e.message).toBe("El pedido no existe.");
  });

  it("usa el mensaje del servidor cuando es dinámico y agrega los campos de INVALID_INPUT", () => {
    const transition = mapCallableError(
      Object.assign(new Error('Estado actual: "paid"'), { code: "functions/failed-precondition", details: { code: "INVALID_TRANSITION" } }),
    );
    expect(transition.message).toContain("paid");
    const invalid = mapCallableError(
      Object.assign(new Error("Datos inválidos."), {
        code: "functions/invalid-argument",
        details: { code: "INVALID_INPUT", fields: [{ path: "rows.0.SKU", message: "x" }] },
      }),
    );
    expect(invalid.message).toContain("rows.0.SKU");
  });

  it("sesión, permisos y red", () => {
    expect(mapCallableError({ code: "functions/unauthenticated" }).code).toBe("UNAUTHENTICATED");
    expect(mapCallableError({ code: "functions/permission-denied" }).code).toBe("NOT_ADMIN");
    expect(mapCallableError({ code: "functions/unavailable" }).code).toBe("NETWORK");
    expect(mapCallableError(new Error("???")).code).toBe("INTERNAL");
  });
});

describe("callables del catálogo", () => {
  it("envía solo lo que define el contrato", async () => {
    const invoke = vi.fn(async () => report);
    const c = createCatalogCallables(invoke);
    await c.importPrices({ rows: [{ SKU: "A", PRECIO: 10 }], dryRun: true, fileName: "p.xlsx" });
    expect(invoke).toHaveBeenCalledWith("importPrices", { rows: [{ SKU: "A", PRECIO: 10 }], dryRun: true, fileName: "p.xlsx" });
    await c.applyDiscount({ skus: ["A"], discount: null });
    expect(invoke).toHaveBeenLastCalledWith("applyDiscount", { skus: ["A"], discount: null });
    await c.createProduct({ sku: "Z", name: " N ", price: 5, stock: 1, barcode: " " });
    expect(invoke).toHaveBeenLastCalledWith("createProduct", { sku: "Z", name: "N", price: 5, stock: 1 });
    await c.updateProductCommerce({ sku: "Z", stock: 3 });
    expect(invoke).toHaveBeenLastCalledWith("updateProductCommerce", { sku: "Z", stock: 3 });
  });

  it("adapta el BatchReport de deleteProducts al DeleteReport", async () => {
    const c = createCatalogCallables(async () => report);
    const r = await c.deleteProducts({ skus: ["A", "B", "C"] });
    expect(r).toMatchObject({ rows: 3, deleted: 2, deletedSkus: ["A", "C"], skipped: 1 });
    const restored = await c.restoreProducts({ skus: ["A", "B", "C"] });
    expect(restored.restoredSkus).toEqual(["A", "C"]);
  });

  it("rechaza una respuesta inesperada", async () => {
    const c = createCatalogCallables(async () => "texto");
    await expect(c.importStock({ rows: [] })).rejects.toBeInstanceOf(AdminServiceError);
  });
});

describe("callables de pedidos", () => {
  it("confirmTransferPayment: alreadyPaid no cambia nada", async () => {
    const o = createOrderCallables(async () => ({ orderNumber: "NE-000001", paymentStatus: "paid", alreadyPaid: true, fulfillmentStatus: "preparing" }));
    expect((await o.confirmTransferPayment({ orderNumber: "NE-000001" })).changed).toBe(false);
  });

  it("avisa cuando el pago pasa a revisión", async () => {
    const o = createOrderCallables(async () => ({ paymentStatus: "payment_review", alreadyPaid: false }));
    expect((await o.confirmTransferPayment({ orderNumber: "NE-000001" })).message).toMatch(/revisión/);
  });

  it("updateFulfillment y recordManualRefund arman la petición del contrato", async () => {
    const invoke = vi.fn(async () => ({ changed: true, alreadyRefunded: false }));
    const o = createOrderCallables(invoke);
    await o.updateFulfillment({ orderNumber: "NE-000001", to: "delivered", note: " ", reason: "Error" });
    expect(invoke).toHaveBeenLastCalledWith("updateFulfillment", { orderNumber: "NE-000001", to: "delivered", reason: "Error" });
    await o.recordManualRefund({
      orderNumber: "NE-000001",
      amount: 100,
      method: "flow",
      refundedAt: "2026-10-01T00:00:00Z",
      note: " n ",
      restock: false,
    });
    expect(invoke).toHaveBeenLastCalledWith("recordManualRefund", {
      orderNumber: "NE-000001",
      amount: 100,
      method: "flow",
      refundedAt: "2026-10-01T00:00:00Z",
      note: "n",
      restock: false,
    });
  });

  it("una callable inexistente falla con el mensaje claro", async () => {
    const o = createOrderCallables(async () => {
      throw mapCallableError({ code: "functions/not-found" });
    });
    await expect(o.cancelOrder({ orderNumber: "NE-000001", reason: "x" })).rejects.toThrow(FUNCTION_UNAVAILABLE_MESSAGE);
  });
});
