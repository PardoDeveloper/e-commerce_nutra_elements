import { describe, expect, it } from "vitest";
import { planApplyDiscount, planImportCatalog, planImportPrices, planImportStock } from "./batch";
import { createDemoService, publishBlocker } from "./demo-service";
import { AdminServiceError } from "./errors";
import { defaultSettings } from "./seed";
import { makeOrder, makeProduct, NOW } from "./testing";

function setup(count = 3) {
  const products = Array.from({ length: count }, (_, i) =>
    makeProduct({ sku: String(1001 + i), name: `Producto ${i + 1}`, slug: `producto-${i + 1}` }),
  );
  const settings = defaultSettings({ shippingFee: 3990, freeShippingThreshold: null, pickup: { enabled: true, address: "Calle 1", hours: "9 a 20" }, maxQtyPerItem: 10 });
  return createDemoService({ products, orders: [makeOrder()], settings }, () => new Date(NOW));
}

describe("deleteProducts", () => {
  it("marca deletedAt/deletedBy y fuerza published=false", async () => {
    const svc = setup();
    const r = await svc.deleteProducts({ skus: ["1001", "1002"] });
    expect(r).toMatchObject({ rows: 2, deleted: 2, skipped: 0, invalid: [] });
    const [a, b, c] = svc.getState().products;
    expect(a).toMatchObject({ published: false, deletedAt: NOW, deletedBy: "demo-admin" });
    expect(b).toMatchObject({ published: false, deletedAt: NOW });
    expect(c).toMatchObject({ published: true, deletedAt: null });
  });

  it("conserva el producto y los pedidos", async () => {
    const svc = setup();
    await svc.deleteProducts({ skus: ["1001"] });
    expect(svc.getState().products).toHaveLength(3);
    expect(svc.getState().orders[0]?.items[0]?.sku).toBe("1001");
  });

  it("informa duplicados, inexistentes y ya eliminados por fila", async () => {
    const svc = setup();
    await svc.deleteProducts({ skus: ["1001"] });
    const r = await svc.deleteProducts({ skus: ["1001", "9999", "1002", "1002"] });
    expect(r.deleted).toBe(1);
    expect(r.deletedSkus).toEqual(["1002"]);
    expect(r.invalid).toEqual([
      expect.objectContaining({ row: 1, sku: "1001", code: "ALREADY_DELETED" }),
      expect.objectContaining({ row: 2, sku: "9999", code: "SKU_NOT_FOUND" }),
      expect.objectContaining({ row: 4, sku: "1002", code: "DUPLICATE_SKU" }),
    ]);
  });

  it("rechaza más de 200 con TOO_MANY_ROWS y una lista vacía con EMPTY_BATCH", async () => {
    const svc = setup();
    const many = Array.from({ length: 201 }, (_, i) => String(i));
    await expect(svc.deleteProducts({ skus: many })).rejects.toMatchObject({ code: "TOO_MANY_ROWS" });
    await expect(svc.deleteProducts({ skus: [] })).rejects.toBeInstanceOf(AdminServiceError);
    expect(svc.getState().products.every((p) => p.deletedAt === null)).toBe(true);
  });

  it("acepta exactamente 200", async () => {
    const svc = setup(200);
    const skus = svc.getState().products.map((p) => p.sku);
    const r = await svc.deleteProducts({ skus });
    expect(r.deleted).toBe(200);
  });

  it("notifica a los suscriptores", async () => {
    const svc = setup();
    let calls = 0;
    svc.subscribe(() => calls++);
    await svc.deleteProducts({ skus: ["1001"] });
    await svc.deleteProducts({ skus: ["1001"] }); // nada que cambiar
    expect(calls).toBe(1);
  });

  it("bloquea editar, publicar y desactivar un producto eliminado", async () => {
    const svc = setup();
    await svc.deleteProducts({ skus: ["1001"] });
    await expect(svc.updateProductCommerce({ sku: "1001", price: 5000 })).rejects.toMatchObject({ code: "PRODUCT_DELETED" });
    await expect(svc.updateProductContent("1001", { name: "Otro" })).rejects.toMatchObject({ code: "PRODUCT_DELETED" });
    await expect(svc.setProductActive("1001", false)).rejects.toMatchObject({ code: "PRODUCT_DELETED" });
    const r = await svc.setProductsPublished({ skus: ["1001"], published: true });
    expect(r.invalid[0]).toMatchObject({ code: "PRODUCT_DELETED" });
    expect(publishBlocker(svc.getState().products[0]!, [], new Set())?.code).toBe("PRODUCT_DELETED");
  });
});

describe("restoreProducts", () => {
  it("limpia deletedAt y deja el producto despublicado", async () => {
    const svc = setup();
    await svc.deleteProducts({ skus: ["1001", "1002"] });
    const r = await svc.restoreProducts({ skus: ["1001"] });
    expect(r).toMatchObject({ restored: 1, restoredSkus: ["1001"], skipped: 0 });
    expect(svc.getState().products[0]).toMatchObject({ deletedAt: null, deletedBy: null, published: false });
    expect(svc.getState().products[1]?.deletedAt).toBe(NOW);
  });

  it("informa NOT_DELETED, SKU_NOT_FOUND y DUPLICATE_SKU", async () => {
    const svc = setup();
    await svc.deleteProducts({ skus: ["1001"] });
    const r = await svc.restoreProducts({ skus: ["1001", "1001", "1002", "7777"] });
    expect(r.restored).toBe(1);
    expect(r.invalid.map((i) => i.code)).toEqual(["DUPLICATE_SKU", "NOT_DELETED", "SKU_NOT_FOUND"]);
  });

  it("rechaza más de 200", async () => {
    const svc = setup();
    await expect(svc.restoreProducts({ skus: Array.from({ length: 201 }, (_, i) => String(i)) })).rejects.toMatchObject({ code: "TOO_MANY_ROWS" });
  });

  it("después de restaurar se puede editar de nuevo", async () => {
    const svc = setup();
    await svc.deleteProducts({ skus: ["1001"] });
    await svc.restoreProducts({ skus: ["1001"] });
    const r = await svc.updateProductCommerce({ sku: "1001", price: 5000 });
    expect(r.price).toBe(5000);
  });
});

describe("PRODUCT_DELETED en las importaciones", () => {
  const deleted = makeProduct({ sku: "1001", deletedAt: NOW, deletedBy: "demo-admin", published: false });
  const live = makeProduct({ sku: "2002", slug: "otro" });
  const map = new Map([deleted, live].map((p) => [p.sku, p] as const));

  it("precio: fila inválida, sin cambios ni operaciones sobre el eliminado", () => {
    const plan = planImportPrices([{ SKU: "1001", PRECIO: 20000 }, { SKU: "2002", PRECIO: 20000 }], map);
    expect(plan.report.invalid).toEqual([expect.objectContaining({ row: 2, sku: "1001", code: "PRODUCT_DELETED" })]);
    expect(plan.report.updated).toBe(1);
    expect(plan.ops.map((o) => o.sku)).toEqual(["2002"]);
  });

  it("stock: fila inválida y sin operaciones", () => {
    const plan = planImportStock([{ SKU: "1001", STOCK: 50 }], map);
    expect(plan.report.invalid).toEqual([expect.objectContaining({ sku: "1001", code: "PRODUCT_DELETED" })]);
    expect(plan.ops).toHaveLength(0);
  });

  it("planilla: no revive ni cambia el SKU eliminado, y no lo crea de nuevo", () => {
    const row = { ID: 1001, NOMBRE: "PRODUCTO", CODIGO_BARRA: null, STOCK_ACTUAL: 5, PRECIO_VENTA_PUBLICO: 9990, ACTIVO: "SI", LABORATORIO: "NUTRA ELEMENTS" };
    const plan = planImportCatalog([row], map);
    expect(plan.report.invalid).toEqual([expect.objectContaining({ sku: "1001", code: "PRODUCT_DELETED" })]);
    expect(plan.report.created).toBe(0);
    expect(plan.ops).toHaveLength(0);
  });

  it("descuento: un eliminado se omite", () => {
    const plan = planApplyDiscount(["1001", "2002"], { type: "percent", value: 10 }, map);
    expect(plan.report.invalid).toEqual([expect.objectContaining({ sku: "1001", code: "PRODUCT_DELETED" })]);
    expect(plan.ops.map((o) => o.sku)).toEqual(["2002"]);
  });

  it("de punta a punta: importar precio sobre un eliminado no lo revive", async () => {
    const svc = setup();
    await svc.deleteProducts({ skus: ["1001"] });
    const r = await svc.importPrices({ rows: [{ SKU: "1001", PRECIO: 20000 }] });
    expect(r.invalid[0]?.code).toBe("PRODUCT_DELETED");
    expect(svc.getState().products[0]).toMatchObject({ price: 10000, deletedAt: NOW, published: false });
  });
});
