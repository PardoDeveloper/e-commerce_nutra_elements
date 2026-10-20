import { describe, expect, it } from "vitest";
import { createMockOrderService, type MockSettings, type StorageLike } from "./mock-service";
import type { CatalogEntry } from "./summary";
import { OrderServiceError, type CreateOrderRequest } from "./types";

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const catalog: Record<string, CatalogEntry> = {
  A: { sku: "A", name: "Vitamina A", slug: "a", categoryId: "vitaminas", price: 10000, finalPrice: 10000, inStock: true },
  B: { sku: "B", name: "Magnesio B", slug: "b", categoryId: "magnesio", price: 20000, finalPrice: 17000, inStock: true },
  C: { sku: "C", name: "Sin stock", slug: "c", categoryId: "minerales", price: 5000, finalPrice: 5000, inStock: false },
};
const settings: MockSettings = {
  shippingFee: 3990,
  freeShippingThreshold: null,
  communes: [{ code: "puente-alto", name: "Puente Alto" }],
  pickup: { enabled: true, address: "Av. Concha y Toro 180, Puente Alto", hours: "Lunes a viernes de 9:00 a 20:00" },
  maxQtyPerItem: 10,
};

const request = (over: Partial<CreateOrderRequest> = {}): CreateOrderRequest => ({
  clientRequestId: "req-1",
  items: [
    { sku: "A", qty: 2 },
    { sku: "B", qty: 1 },
  ],
  paymentMethod: "flow",
  customer: { firstName: "Ana", lastName: "Pérez", email: "ana@correo.cl", phone: "+56912345678", rut: "12345678-5" },
  delivery: { type: "shipping", communeCode: "puente-alto", address: "Calle 123" },
  ...over,
});

const t0 = new Date("2026-10-15T12:00:00Z");

function setup(nowFn: () => Date = () => t0) {
  const storage = memoryStorage();
  return { storage, service: createMockOrderService({ storage, catalog, settings, now: nowFn }) };
}

describe("mockOrderService", () => {
  it("numera NE-000001, NE-000002 y calcula el total", async () => {
    const { service } = setup();
    const first = await service.createOrder(request());
    expect(first.orderNumber).toBe("NE-000001");
    expect(first.subtotal).toBe(37000);
    expect(first.shipping).toBe(3990);
    expect(first.total).toBe(40990);
    expect(first.next).toBe("pay_with_flow");
    const second = await service.createOrder(request({ clientRequestId: "req-2", paymentMethod: "transfer", delivery: { type: "pickup" } }));
    expect(second.orderNumber).toBe("NE-000002");
    expect(second.shipping).toBe(0);
    expect(second.next).toBe("show_transfer_instructions");
  });

  it("es idempotente con el mismo clientRequestId", async () => {
    const { service } = setup();
    const a = await service.createOrder(request());
    const b = await service.createOrder(request());
    expect(b.orderNumber).toBe(a.orderNumber);
  });

  it("rechaza RUT inválido, sin stock, SKU inexistente y duplicados", async () => {
    const { service } = setup();
    await expect(service.createOrder(request({ customer: { ...request().customer, rut: "12345678-4" } }))).rejects.toMatchObject({ code: "INVALID_RUT" });
    await expect(service.createOrder(request({ items: [{ sku: "C", qty: 1 }] }))).rejects.toMatchObject({ code: "OUT_OF_STOCK", sku: "C" });
    await expect(service.createOrder(request({ items: [{ sku: "Z", qty: 1 }] }))).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
    await expect(
      service.createOrder(
        request({
          items: [
            { sku: "A", qty: 1 },
            { sku: "A", qty: 1 },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(OrderServiceError);
  });

  it("getOrderStatus exige el token y no guarda ni devuelve datos personales", async () => {
    const { service, storage } = setup();
    const order = await service.createOrder(request({ paymentMethod: "transfer" }));
    await expect(service.getOrderStatus({ orderNumber: order.orderNumber, accessToken: "otro" })).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    const status = await service.getOrderStatus({ orderNumber: order.orderNumber, accessToken: order.accessToken });
    expect(status.transferInstructions?.reference).toBe("NE-000001");
    expect(status.transferInstructions?.amount).toBe(40990);
    const everything = JSON.stringify(status) + (storage.getItem("ne.orders.v1") ?? "");
    expect(everything).not.toContain("12345678");
    expect(everything).not.toContain("ana@correo.cl");
    expect(everything).not.toContain("Calle 123");
  });

  it("reserva 48 h con transferencia y 30 min con Flow; luego vence", async () => {
    let current = t0;
    const { service } = setup(() => current);
    const flow = await service.createOrder(request());
    const transfer = await service.createOrder(request({ clientRequestId: "r2", paymentMethod: "transfer" }));
    expect(new Date(flow.reservedUntil).getTime() - t0.getTime()).toBe(30 * 60_000);
    expect(new Date(transfer.reservedUntil).getTime() - t0.getTime()).toBe(48 * 3_600_000);
    current = new Date(t0.getTime() + 31 * 60_000);
    const status = await service.getOrderStatus({ orderNumber: flow.orderNumber, accessToken: flow.accessToken });
    expect(status.paymentStatus).toBe("expired");
    await expect(service.createFlowPayment({ orderNumber: flow.orderNumber, accessToken: flow.accessToken })).rejects.toMatchObject({ code: "ORDER_EXPIRED" });
  });

  it("Flow rechazado permite reintentar; aprobado marca pagado", async () => {
    const { service } = setup();
    const order = await service.createOrder(request());
    const ref = { orderNumber: order.orderNumber, accessToken: order.accessToken };
    const pay = await service.createFlowPayment(ref);
    expect(pay.redirectUrl).toContain("/checkout/flow-simulado?o=NE-000001");
    await service.simulateFlowResult(ref, "rejected");
    let status = await service.getOrderStatus(ref);
    expect(status.paymentStatus).toBe("pending_payment");
    expect(status.lastPaymentAttemptRejected).toBe(true);
    await service.createFlowPayment(ref);
    await service.simulateFlowResult(ref, "approved");
    status = await service.getOrderStatus(ref);
    expect(status.paymentStatus).toBe("paid");
    expect(status.fulfillmentStatus).toBe("preparing");
    await expect(service.createFlowPayment(ref)).rejects.toMatchObject({ code: "ORDER_NOT_PAYABLE" });
  });
});
