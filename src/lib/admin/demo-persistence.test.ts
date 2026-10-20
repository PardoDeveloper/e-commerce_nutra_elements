import { describe, expect, it, vi } from "vitest";
import type { StoredProductInput } from "@/lib/demo-store/types";
import { createDemoService } from "./demo-service";
import { withProductPersistence, type PersistenceClient } from "./demo-persistence";
import { defaultSettings } from "./seed";
import { makeProduct } from "./testing";

function setup(failWith?: Error) {
  const saved: StoredProductInput[][] = [];
  const client: PersistenceClient = {
    saveProducts: vi.fn(async (products) => {
      if (failWith) throw failWith;
      saved.push(products);
    }),
    uploadImage: vi.fn(),
    reset: vi.fn(),
  };
  const settings = defaultSettings({ shippingFee: 3990, freeShippingThreshold: null, pickup: { enabled: true, address: "a", hours: "h" }, maxQtyPerItem: 10 });
  const products = [makeProduct({ sku: "1001" }), makeProduct({ sku: "1002", slug: "otro", name: "Otro" })];
  const service = withProductPersistence(createDemoService({ products, orders: [], settings }), client, new Set(["1001", "1002"]));
  return { service, client, saved };
}

describe("persistencia de productos del admin", () => {
  it("envía solo los productos modificados tras cambiar precio y stock", async () => {
    const { service, saved } = setup();
    await service.updateProductCommerce({ sku: "1001", price: 15000, stock: 7 });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toHaveLength(1);
    expect(saved[0]![0]).toMatchObject({ sku: "1001", price: 15000, stock: 7 });
    expect(saved[0]![0]).not.toHaveProperty("reserved");
    expect(saved[0]![0]).not.toHaveProperty("sourceName");
  });

  it("guarda eliminar, restaurar y descuentos", async () => {
    const { service, saved } = setup();
    await service.deleteProducts({ skus: ["1002"] });
    expect(saved.at(-1)![0]).toMatchObject({ sku: "1002", published: false });
    expect(saved.at(-1)![0]!.deletedAt).not.toBeNull();
    await service.restoreProducts({ skus: ["1002"] });
    expect(saved.at(-1)![0]).toMatchObject({ sku: "1002", deletedAt: null });
    await service.applyDiscount({ skus: ["1001"], discount: { type: "percent", value: 15 } });
    expect(saved.at(-1)![0]).toMatchObject({ sku: "1001", discount: { type: "percent", value: 15 } });
  });

  it("no envía nada en una vista previa (dryRun) ni si no hubo cambios", async () => {
    const { service, client } = setup();
    await service.applyDiscount({ skus: ["1001"], discount: { type: "percent", value: 15 }, dryRun: true });
    await service.updateProductCommerce({ sku: "1001", price: 10000 }); // mismo precio
    expect(client.saveProducts).not.toHaveBeenCalled();
  });

  it("no envía productos que no están en el catálogo base", async () => {
    const { service, client } = setup();
    await service.createProduct({ sku: "NUEVO-1", name: "Nuevo", price: 1000, stock: 1 });
    expect(client.saveProducts).not.toHaveBeenCalled();
  });

  it("si el servidor rechaza, la operación falla con un error claro", async () => {
    const { service } = setup(new Error("Hay datos inválidos."));
    await expect(service.updateProductCommerce({ sku: "1001", price: 15000 })).rejects.toMatchObject({ code: "PERSIST_FAILED" });
  });
});
