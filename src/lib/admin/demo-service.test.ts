import { describe, expect, it } from "vitest";
import { createDemoService, publishBlocker } from "./demo-service";
import { AdminServiceError } from "./errors";
import { defaultSettings } from "./seed";
import { makeOrder, makeProduct, NOW } from "./testing";

function setup() {
  const settings = defaultSettings({
    shippingFee: 3990,
    freeShippingThreshold: null,
    pickup: { enabled: true, address: "Calle 1", hours: "9 a 20" },
    maxQtyPerItem: 10,
  });
  const paid = makeOrder({
    orderNumber: "NE-000002",
    number: 2,
    paymentStatus: "paid",
    fulfillmentStatus: "delivered",
    stockState: "committed",
    paidAt: "2026-10-12T12:00:00.000Z",
  });
  return createDemoService(
    { products: [makeProduct({ stock: 10 }), makeProduct({ sku: "2002", slug: "otro", name: "Otro" })], orders: [makeOrder(), paid], settings },
    () => new Date(NOW),
  );
}

describe("servicio simulado", () => {
  it("dryRun no cambia nada y aplicar sí", async () => {
    const svc = setup();
    const dry = await svc.importPrices({ rows: [{ SKU: "1001", PRECIO: 12000 }], dryRun: true });
    expect(dry.updated).toBe(1);
    expect(svc.getState().products[0]?.price).toBe(10000);
    await svc.importPrices({ rows: [{ SKU: "1001", PRECIO: 12000 }] });
    expect(svc.getState().products[0]).toMatchObject({ price: 12000, finalPrice: 12000 });
  });

  it("notifica a los suscriptores y el estado cambia de referencia", async () => {
    const svc = setup();
    let calls = 0;
    const off = svc.subscribe(() => calls++);
    const before = svc.getState();
    await svc.applyDiscount({ skus: ["1001"], discount: { type: "percent", value: 10 } });
    expect(calls).toBe(1);
    expect(svc.getState()).not.toBe(before);
    expect(svc.getState().products[0]?.finalPrice).toBe(9000);
    off();
    await svc.applyDiscount({ skus: ["1001"], discount: null });
    expect(calls).toBe(1);
  });

  it("confirmar la transferencia paga el pedido", async () => {
    const svc = setup();
    const r = await svc.confirmTransferPayment({ orderNumber: "NE-000001", reference: "123" });
    expect(r.order.paymentStatus).toBe("paid");
    expect(svc.getState().orders[0]?.fulfillmentStatus).toBe("preparing");
  });

  it("cancelar libera la reserva y devuelve el stock", async () => {
    const svc = setup();
    await svc.cancelOrder({ orderNumber: "NE-000001", reason: "Sin pago" });
    expect(svc.getState().products[0]?.stock).toBe(12);
  });

  it("el reembolso con reposición suma el stock una sola vez", async () => {
    const svc = setup();
    const input = { orderNumber: "NE-000002", amount: 5000, method: "transfer" as const, refundedAt: "2026-10-14T12:00:00.000Z", note: "Devuelto", restock: true };
    await svc.recordManualRefund(input);
    expect(svc.getState().products[0]?.stock).toBe(12);
    await svc.recordManualRefund(input);
    expect(svc.getState().products[0]?.stock).toBe(12);
  });

  it("lanza errores con código como las Functions", async () => {
    const svc = setup();
    await expect(svc.updateFulfillment({ orderNumber: "NE-000002", to: "on_route" })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(svc.cancelOrder({ orderNumber: "NE-999999", reason: "x" })).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    await expect(svc.createProduct({ sku: "1001", name: "x", price: 1, stock: 0 })).rejects.toBeInstanceOf(AdminServiceError);
    await expect(svc.updateProductCommerce({ sku: "1001" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("crea productos sin publicar y no los puede publicar sin contenido", async () => {
    const svc = setup();
    await svc.createProduct({ sku: "NEW-1", name: "Nuevo", price: 5000, stock: 3 });
    const created = svc.getState().products.find((p) => p.sku === "NEW-1");
    expect(created).toMatchObject({ published: false, source: "manual", finalPrice: 5000 });
    const report = await svc.setProductsPublished({ skus: ["NEW-1"], published: true });
    expect(report.invalid[0]?.code).toBe("MISSING_SLUG");
  });

  it("despublicar siempre se puede y desactivar despublica", async () => {
    const svc = setup();
    const r = await svc.setProductsPublished({ skus: ["1001"], published: false });
    expect(r.updated).toBe(1);
    await svc.setProductActive("2002", false);
    expect(svc.getState().products[1]).toMatchObject({ active: false, published: false });
  });

  it("detecta slug duplicado al publicar", () => {
    const a = makeProduct({ sku: "A", slug: "igual", published: false });
    const b = makeProduct({ sku: "B", slug: "igual" });
    expect(publishBlocker(a, [a, b], new Set())?.code).toBe("DUPLICATE_SLUG");
  });

  it("el precio por producto recalcula el precio final y valida", async () => {
    const svc = setup();
    await svc.applyDiscount({ skus: ["1001"], discount: { type: "fixed", value: 4000 } });
    const r = await svc.updateProductCommerce({ sku: "1001", price: 3000 });
    expect(r.warnings[0]).toMatch(/DISCOUNT_REMOVED/);
    expect(r.finalPrice).toBe(3000);
    await expect(svc.updateProductCommerce({ sku: "1001", price: 0 })).rejects.toMatchObject({ code: "INVALID_PRICE" });
  });

  it("valida los ajustes", async () => {
    const svc = setup();
    const s = svc.getState().settings;
    await expect(svc.saveSettings({ ...s, shippingFee: -1 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(svc.saveSettings({ ...s, freeShippingThreshold: 0 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await svc.saveSettings({ ...s, freeShippingThreshold: null, shippingFee: 4990 });
    expect(svc.getState().settings.shippingFee).toBe(4990);
  });
});
