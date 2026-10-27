import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import {
  handleApplyDiscount,
  handleCreateProduct,
  handleDeleteProducts,
  handleRestoreProducts,
  handleSetProductsPublished,
  handleUpdateProductCommerce,
} from "./handlers.js";
import { planSetPublished } from "./plan-publish.js";
import { MemoryStore, productFixture } from "./testing/memory-store.js";

const UID = "admin-1";

async function failure(promise: Promise<unknown>): Promise<HttpsError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof HttpsError) return e;
    throw e;
  }
  throw new Error("Se esperaba un error");
}
const codeOf = (e: HttpsError) => (e.details as { code: string }).code;

// ---------- applyDiscount ----------

describe("applyDiscount", () => {
  function seeded() {
    const store = new MemoryStore();
    store.seedProduct("1", productFixture("1", { price: 10000, finalPrice: 10000 }));
    store.seedProduct("2", productFixture("2", { price: 500, finalPrice: 500 }));
    store.seedProduct("3", productFixture("3", { price: 10000, finalPrice: 9000, discount: { type: "percent", value: 10 } }));
    store.seedProduct("4", productFixture("4", { deletedAt: new Date("2026-10-01") }));
    return store;
  }

  it("aplica un porcentaje y calcula finalPrice (mitades hacia arriba)", async () => {
    const store = seeded();
    store.seedProduct("5", productFixture("5", { price: 1005, finalPrice: 1005 }));
    const report = await handleApplyDiscount(store, { skus: ["1", "5"], discount: { type: "percent", value: 10 } }, UID);
    expect(report.updated).toBe(2);
    expect(store.product("1")).toMatchObject({ discount: { type: "percent", value: 10 }, finalPrice: 9000, price: 10000 });
    expect(store.product("5")["finalPrice"]).toBe(905); // 1005 * 0.9 = 904.5 -> 905
    expect(store.imports[0]?.record.kind).toBe("discount");
  });

  it("monto fijo mayor o igual al precio: DISCOUNT_TOO_HIGH solo en esa fila", async () => {
    const store = seeded();
    const report = await handleApplyDiscount(store, { skus: ["1", "2"], discount: { type: "fixed", value: 500 } }, UID);
    expect(report.updated).toBe(1);
    expect(report.invalid).toMatchObject([{ row: 2, sku: "2", code: "DISCOUNT_TOO_HIGH" }]);
    expect(store.product("1")).toMatchObject({ finalPrice: 9500 });
    expect(store.product("2")["discount"]).toBeNull();
  });

  it("reemplaza el descuento anterior y null lo quita", async () => {
    const store = seeded();
    await handleApplyDiscount(store, { skus: ["3"], discount: { type: "percent", value: 20 } }, UID);
    expect(store.product("3")).toMatchObject({ discount: { type: "percent", value: 20 }, finalPrice: 8000 });
    await handleApplyDiscount(store, { skus: ["3"], discount: null }, UID);
    expect(store.product("3")).toMatchObject({ discount: null, finalPrice: 10000 });
  });

  it("idempotente: mismo descuento = unchanged", async () => {
    const store = seeded();
    const report = await handleApplyDiscount(store, { skus: ["3"], discount: { type: "percent", value: 10 } }, UID);
    expect(report).toMatchObject({ updated: 0, unchanged: 1 });
  });

  it("SKU inexistente, eliminado, repetido e inválido se informan", async () => {
    const store = seeded();
    const report = await handleApplyDiscount(store, { skus: ["99", "4", "1", "1", "a/b"], discount: { type: "percent", value: 5 } }, UID);
    expect(report.invalid.map((r) => [r.row, r.code])).toEqual([
      [1, "SKU_NOT_FOUND"],
      [2, "PRODUCT_DELETED"],
      [4, "DUPLICATE_SKU"],
      [5, "INVALID_SKU"],
    ]);
    expect(report.updated).toBe(1);
    expect(store.product("4")["discount"]).toBeNull();
  });

  it("dryRun no escribe y entrega la vista previa precio actual -> nuevo", async () => {
    const store = seeded();
    const report = await handleApplyDiscount(store, { dryRun: true, skus: ["1"], discount: { type: "percent", value: 50 } }, UID);
    expect(report.changes).toEqual([{ row: 1, sku: "1", name: "Producto 1", field: "discount", from: 10000, to: 5000 }]);
    expect(store.product("1")["discount"]).toBeNull();
    expect(store.imports).toHaveLength(0);
  });

  it.each([
    { type: "percent", value: 0 },
    { type: "percent", value: 100 },
    { type: "percent", value: 10.5 },
    { type: "fixed", value: 0 },
    { type: "fixed", value: -5 },
    { type: "otro", value: 5 },
    { type: "percent", value: 5, extra: true },
    undefined,
  ])("descuento global inválido %j -> INVALID_INPUT", async (discount) => {
    const e = await failure(handleApplyDiscount(new MemoryStore(), { skus: ["1"], ...(discount === undefined ? {} : { discount }) }, UID));
    expect(codeOf(e)).toBe("INVALID_INPUT");
  });

  it("límites: 150 pasan, 151 TOO_MANY_ROWS, 0 EMPTY_BATCH", async () => {
    const store = new MemoryStore();
    const skus = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));
    const ok = await handleApplyDiscount(store, { skus: skus(150), discount: null }, UID);
    expect(ok.rows).toBe(150);
    expect(codeOf(await failure(handleApplyDiscount(store, { skus: skus(151), discount: null }, UID)))).toBe("TOO_MANY_ROWS");
    expect(codeOf(await failure(handleApplyDiscount(store, { skus: [], discount: null }, UID)))).toBe("EMPTY_BATCH");
  });
});

// ---------- setProductsPublished ----------

describe("setProductsPublished", () => {
  const img = (sku: string) => [{ path: `products/${sku}/a.webp`, alt: "Frasco" }];

  function ready(sku: string, overrides: Record<string, unknown> = {}) {
    return productFixture(sku, {
      name: `Producto ${sku}`,
      slug: `producto-${sku}`,
      description: "Descripción",
      categoryId: "magnesio",
      images: img(sku),
      ...overrides,
    });
  }

  function seeded() {
    const store = new MemoryStore();
    store.categories.set("magnesio", { slug: "magnesio", published: true });
    store.categories.set("oculta", { slug: "oculta", published: false });
    return store;
  }

  it("publica un producto completo, fija publishedAt la primera vez y registra imports", async () => {
    const store = seeded();
    store.seedProduct("1", ready("1"));
    const report = await handleSetProductsPublished(store, { skus: ["1"], published: true }, UID);
    expect(report).toMatchObject({ updated: 1, skipped: 0 });
    expect(store.product("1")).toMatchObject({ published: true, publishedAt: store.clock });
    expect(store.imports[0]?.record.kind).toBe("publish");
  });

  it("no pisa publishedAt si ya existía", async () => {
    const store = seeded();
    const first = new Date("2026-09-01T00:00:00Z");
    store.seedProduct("1", ready("1", { publishedAt: first }));
    await handleSetProductsPublished(store, { skus: ["1"], published: true }, UID);
    expect(store.product("1")["publishedAt"]).toEqual(first);
  });

  it("cada condición falla con su código", async () => {
    const store = seeded();
    store.seedProduct("a", ready("a", { active: false }));
    store.seedProduct("b", ready("b", { slug: null }));
    store.seedProduct("c", ready("c", { slug: "Mal Slug" }));
    store.seedProduct("d", ready("d", { description: "  " }));
    store.seedProduct("f", ready("f", { categoryId: "no-existe" }));
    store.seedProduct("g", ready("g", { categoryId: "oculta" }));
    store.seedProduct("h", ready("h", { images: [] }));
    store.seedProduct("i", ready("i", { images: [{ path: "products/otro/a.webp", alt: "x" }] }));
    store.seedProduct("j", ready("j", { images: [{ path: "products/j/a.webp", alt: " " }] }));
    store.seedProduct("k", ready("k", { name: "" }));
    const skus = ["a", "b", "c", "d", "f", "g", "h", "i", "j", "k"];
    const report = await handleSetProductsPublished(store, { skus, published: true }, UID);
    expect(report.updated).toBe(0);
    expect(report.invalid.map((r) => r.code)).toEqual([
      "NOT_ACTIVE",
      "MISSING_SLUG",
      "INVALID_SLUG",
      "MISSING_DESCRIPTION",
      "INVALID_CATEGORY",
      "INVALID_CATEGORY",
      "MISSING_IMAGE",
      "MISSING_IMAGE",
      "MISSING_IMAGE",
      "MISSING_NAME",
    ]);
    for (const sku of skus) expect(store.product(sku)["published"]).toBe(false);
  });

  it("el mensaje lista todos los problemas de la fila", async () => {
    const store = seeded();
    store.seedProduct("1", productFixture("1"));
    const report = await handleSetProductsPublished(store, { skus: ["1"], published: true }, UID);
    expect(report.invalid[0]?.message).toMatch(/slug.*descripción.*imagen/);
  });

  it("publica un producto sin categoría: es opcional (D-040)", async () => {
    const store = seeded();
    store.seedProduct("1", ready("1", { categoryId: null }));
    const report = await handleSetProductsPublished(store, { skus: ["1"], published: true }, UID);
    expect(report).toMatchObject({ updated: 1, skipped: 0 });
    expect(store.product("1")["published"]).toBe(true);
  });

  it("slug duplicado contra otro producto vigente de la base", async () => {
    const store = seeded();
    store.seedProduct("1", ready("1", { slug: "igual" }));
    store.seedProduct("2", ready("2", { slug: "igual", published: true }));
    const report = await handleSetProductsPublished(store, { skus: ["1"], published: true }, UID);
    expect(report.invalid).toMatchObject([{ sku: "1", code: "DUPLICATE_SLUG" }]);
  });

  it("un slug usado por un producto eliminado no bloquea", async () => {
    const store = seeded();
    store.seedProduct("1", ready("1", { slug: "igual" }));
    store.seedProduct("2", ready("2", { slug: "igual", deletedAt: new Date("2026-10-01") }));
    const report = await handleSetProductsPublished(store, { skus: ["1"], published: true }, UID);
    expect(report.updated).toBe(1);
  });

  it("dos productos con el mismo slug en la base: ninguno se publica hasta corregir uno", async () => {
    const store = seeded();
    store.seedProduct("1", ready("1", { slug: "igual" }));
    store.seedProduct("2", ready("2", { slug: "igual" }));
    const report = await handleSetProductsPublished(store, { skus: ["1", "2"], published: true }, UID);
    expect(report.updated).toBe(0);
    expect(report.invalid.map((r) => [r.sku, r.code])).toEqual([["1", "DUPLICATE_SLUG"], ["2", "DUPLICATE_SLUG"]]);
  });

  it("un slug reclamado por un trozo anterior del mismo lote bloquea al siguiente", async () => {
    const store = seeded();
    store.seedProduct("2", ready("2", { slug: "igual" }));
    const claimed = new Map([["igual", "1"]]);
    const plan = await store.runTransaction((tx) => planSetPublished(tx, [{ row: 1, sku: "2", input: null }], true, claimed), { readOnly: true });
    expect(plan.collector.invalid).toMatchObject([{ sku: "2", code: "DUPLICATE_SLUG" }]);
    expect(plan.ops).toHaveLength(0);
  });

  it("despublicar siempre se permite, aunque falten datos", async () => {
    const store = seeded();
    store.seedProduct("1", productFixture("1", { published: true }));
    const report = await handleSetProductsPublished(store, { skus: ["1"], published: false }, UID);
    expect(report.updated).toBe(1);
    expect(store.product("1")["published"]).toBe(false);
  });

  it("idempotente: publicar lo ya publicado y despublicar lo ya despublicado = unchanged", async () => {
    const store = seeded();
    store.seedProduct("1", ready("1", { published: true }));
    store.seedProduct("2", productFixture("2"));
    expect((await handleSetProductsPublished(store, { skus: ["1"], published: true }, UID)).unchanged).toBe(1);
    expect((await handleSetProductsPublished(store, { skus: ["2"], published: false }, UID)).unchanged).toBe(1);
  });

  it("D-029: un SKU eliminado es PRODUCT_DELETED al publicar y al despublicar", async () => {
    const store = seeded();
    store.seedProduct("1", ready("1", { deletedAt: new Date("2026-10-01") }));
    for (const published of [true, false]) {
      const report = await handleSetProductsPublished(store, { skus: ["1"], published }, UID);
      expect(report.invalid).toMatchObject([{ sku: "1", code: "PRODUCT_DELETED" }]);
    }
    expect(store.product("1")["published"]).toBe(false);
  });

  it("SKU inexistente y published obligatorio", async () => {
    const store = seeded();
    const report = await handleSetProductsPublished(store, { skus: ["404"], published: true }, UID);
    expect(report.invalid[0]?.code).toBe("SKU_NOT_FOUND");
    expect(codeOf(await failure(handleSetProductsPublished(store, { skus: ["1"] }, UID)))).toBe("INVALID_INPUT");
  });

  it("dryRun no escribe", async () => {
    const store = seeded();
    store.seedProduct("1", ready("1"));
    const report = await handleSetProductsPublished(store, { dryRun: true, skus: ["1"], published: true }, UID);
    expect(report).toMatchObject({ dryRun: true, updated: 1, importId: null });
    expect(store.product("1")["published"]).toBe(false);
  });
});

// ---------- deleteProducts / restoreProducts (D-029, test 12b) ----------

describe("deleteProducts", () => {
  function seeded() {
    const store = new MemoryStore();
    store.seedProduct("1", productFixture("1", { published: true, publishedAt: new Date("2026-10-02"), slug: "uno", images: [{ path: "products/1/a.webp", alt: "x" }], stock: 7, reserved: 2, price: 9990, active: true }));
    store.seedProduct("2", productFixture("2"));
    store.seedProduct("3", productFixture("3", { deletedAt: new Date("2026-10-01"), deletedBy: "u0" }));
    return store;
  }

  it("(a) elimina un producto publicado: deletedAt, deletedBy, published=false; conserva el resto", async () => {
    const store = seeded();
    const before = structuredClone(store.product("1"));
    const report = await handleDeleteProducts(store, { skus: ["1"] }, UID);
    expect(report).toMatchObject({ updated: 1, unchanged: 0, skipped: 0 });
    const p = store.product("1");
    expect(p).toMatchObject({ deletedAt: store.clock, deletedBy: UID, published: false, stock: 7, reserved: 2, price: 9990, active: true, slug: "uno" });
    expect(p["images"]).toEqual(before["images"]);
    expect(store.imports[0]?.record).toMatchObject({ kind: "delete", createdBy: UID, rows: 1, updated: 1 });
  });

  it("(b) lote mixto: solo los válidos se aplican", async () => {
    const store = seeded();
    const report = await handleDeleteProducts(store, { skus: ["1", "404", "3", "2", "2", "a/b"] }, UID);
    expect(report.updated).toBe(2);
    expect(report.invalid.map((r) => [r.row, r.sku, r.code])).toEqual([
      [2, "404", "SKU_NOT_FOUND"],
      [3, "3", "ALREADY_DELETED"],
      [5, "2", "DUPLICATE_SKU"],
      [6, undefined, "INVALID_SKU"],
    ]);
    expect(store.product("3")["deletedBy"]).toBe("u0");
  });

  it("(c) 200 pasan, 201 TOO_MANY_ROWS sin cambios, vacío EMPTY_BATCH", async () => {
    const store = new MemoryStore();
    const skus = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));
    for (let i = 1; i <= 201; i++) store.seedProduct(String(i), productFixture(String(i)));
    const ok = await handleDeleteProducts(store, { skus: skus(200) }, UID);
    expect(ok.updated).toBe(200);

    const store2 = new MemoryStore();
    for (let i = 1; i <= 201; i++) store2.seedProduct(String(i), productFixture(String(i)));
    expect(codeOf(await failure(handleDeleteProducts(store2, { skus: skus(201) }, UID)))).toBe("TOO_MANY_ROWS");
    expect([...store2.products.values()].every((p) => p["deletedAt"] === null)).toBe(true);
    expect(codeOf(await failure(handleDeleteProducts(store2, { skus: [] }, UID)))).toBe("EMPTY_BATCH");
    expect(store2.imports).toHaveLength(0);
  });

  it("(d) idempotencia: repetir, también en paralelo, no pisa deletedAt/deletedBy originales", async () => {
    const store = seeded();
    const results = await Promise.all([
      handleDeleteProducts(store, { skus: ["2"] }, "u1"),
      handleDeleteProducts(store, { skus: ["2"] }, "u2"),
      handleDeleteProducts(store, { skus: ["2"] }, "u3"),
    ]);
    expect(results.filter((r) => r.updated === 1)).toHaveLength(1);
    expect(results.filter((r) => r.invalid[0]?.code === "ALREADY_DELETED")).toHaveLength(2);
    const winner = store.imports.find((i) => i.record.updated === 1)?.record.createdBy;
    expect(store.product("2")["deletedBy"]).toBe(winner);
    const again = await handleDeleteProducts(store, { skus: ["2"] }, "u4");
    expect(again.invalid[0]?.code).toBe("ALREADY_DELETED");
    expect(store.product("2")["deletedBy"]).toBe(winner);
  });

  it("(f) dryRun no escribe ni crea imports", async () => {
    const store = seeded();
    const report = await handleDeleteProducts(store, { dryRun: true, skus: ["1", "2"] }, UID);
    expect(report).toMatchObject({ dryRun: true, updated: 2, importId: null });
    expect(store.product("1")["deletedAt"]).toBeNull();
    expect(store.imports).toHaveLength(0);
  });

  it("elimina también un documento con campos dañados (solo depende de deletedAt)", async () => {
    const store = new MemoryStore();
    store.seedProduct("9", productFixture("9", { price: "roto" }));
    const report = await handleDeleteProducts(store, { skus: ["9"] }, UID);
    expect(report.updated).toBe(1);
    expect(store.product("9")["deletedBy"]).toBe(UID);
  });
});

describe("restoreProducts", () => {
  it("(e) restaura: deletedAt/deletedBy null y queda despublicado", async () => {
    const store = new MemoryStore();
    store.seedProduct("3", productFixture("3", { deletedAt: new Date("2026-10-01"), deletedBy: "u0", published: false, price: 4321 }));
    store.seedProduct("1", productFixture("1"));
    const report = await handleRestoreProducts(store, { skus: ["3", "1", "404", "3"] }, UID);
    expect(report.updated).toBe(1);
    expect(report.invalid.map((r) => [r.sku, r.code])).toEqual([
      ["1", "NOT_DELETED"],
      ["404", "SKU_NOT_FOUND"],
      ["3", "DUPLICATE_SKU"],
    ]);
    expect(store.product("3")).toMatchObject({ deletedAt: null, deletedBy: null, published: false, price: 4321 });
    expect(store.imports[0]?.record.kind).toBe("restore");
  });

  it("repetir restoreProducts da NOT_DELETED", async () => {
    const store = new MemoryStore();
    store.seedProduct("3", productFixture("3", { deletedAt: new Date("2026-10-01"), deletedBy: "u0" }));
    await handleRestoreProducts(store, { skus: ["3"] }, UID);
    const again = await handleRestoreProducts(store, { skus: ["3"] }, UID);
    expect(again.invalid[0]?.code).toBe("NOT_DELETED");
  });

  it("eliminar, restaurar y volver a publicar exige las validaciones de publicación", async () => {
    const store = new MemoryStore();
    store.categories.set("magnesio", { published: true });
    store.seedProduct("1", productFixture("1", { published: true, slug: "uno", description: "d", categoryId: "magnesio", images: [{ path: "products/1/a.webp", alt: "x" }] }));
    await handleDeleteProducts(store, { skus: ["1"] }, UID);
    await handleRestoreProducts(store, { skus: ["1"] }, UID);
    expect(store.product("1")["published"]).toBe(false);
    const report = await handleSetProductsPublished(store, { skus: ["1"], published: true }, UID);
    expect(report.updated).toBe(1);
  });
});

// ---------- createProduct ----------

describe("createProduct", () => {
  const body = { sku: "NEW-1", name: "Producto nuevo", price: 12990, stock: 4, barcode: "4006381333931" };

  it("crea con published=false, source manual y deletedAt: null explícito", async () => {
    const store = new MemoryStore();
    expect(await handleCreateProduct(store, body, UID)).toEqual({ sku: "NEW-1", created: true });
    expect(store.product("NEW-1")).toMatchObject({
      sku: "NEW-1",
      name: "Producto nuevo",
      sourceName: "Producto nuevo",
      price: 12990,
      finalPrice: 12990,
      stock: 4,
      reserved: 0,
      inStock: true,
      active: true,
      published: false,
      source: "manual",
      barcode: "4006381333931",
      gtin: "4006381333931",
      deletedAt: null,
      deletedBy: null,
      discount: null,
    });
    expect(store.imports[0]?.record).toMatchObject({ kind: "create", createdBy: UID, created: 1 });
  });

  it("stock 0 deja inStock false", async () => {
    const store = new MemoryStore();
    await handleCreateProduct(store, { ...body, stock: 0 }, UID);
    expect(store.product("NEW-1")["inStock"]).toBe(false);
  });

  it("idempotente con datos idénticos (created: false, sin auditoría nueva)", async () => {
    const store = new MemoryStore();
    await handleCreateProduct(store, body, UID);
    expect(await handleCreateProduct(store, body, UID)).toEqual({ sku: "NEW-1", created: false });
    expect(store.imports).toHaveLength(1);
  });

  it("SKU existente con datos distintos: SKU_EXISTS", async () => {
    const store = new MemoryStore();
    await handleCreateProduct(store, body, UID);
    const e = await failure(handleCreateProduct(store, { ...body, price: 1 }, UID));
    expect(e.code).toBe("failed-precondition");
    expect(codeOf(e)).toBe("SKU_EXISTS");
  });

  it("SKU eliminado: PRODUCT_DELETED y no se revive", async () => {
    const store = new MemoryStore();
    store.seedProduct("NEW-1", productFixture("NEW-1", { deletedAt: new Date("2026-10-01"), price: 1 }));
    const e = await failure(handleCreateProduct(store, body, UID));
    expect(codeOf(e)).toBe("PRODUCT_DELETED");
    expect(store.product("NEW-1")["price"]).toBe(1);
  });

  it.each([
    { ...body, sku: "a/b" },
    { ...body, name: "" },
    { ...body, price: 0 },
    { ...body, price: 12.5 },
    { ...body, stock: -1 },
    { ...body, stock: "3" },
    { ...body, finalPrice: 1 },
    { ...body, published: true },
    { sku: "x" },
  ])("entrada inválida %j -> INVALID_INPUT", async (data) => {
    const e = await failure(handleCreateProduct(new MemoryStore(), data, UID));
    expect(codeOf(e)).toBe("INVALID_INPUT");
  });
});

// ---------- updateProductCommerce ----------

describe("updateProductCommerce", () => {
  function seeded() {
    const store = new MemoryStore();
    store.seedProduct("1", productFixture("1", { price: 10000, finalPrice: 9000, discount: { type: "percent", value: 10 }, stock: 3, reserved: 2 }));
    store.seedProduct("2", productFixture("2", { price: 5000, finalPrice: 4000, discount: { type: "fixed", value: 1000 } }));
    store.seedProduct("3", productFixture("3", { deletedAt: new Date("2026-10-01"), price: 700 }));
    return store;
  }

  it("cambia el precio y recalcula finalPrice conservando el descuento válido", async () => {
    const store = seeded();
    const r = await handleUpdateProductCommerce(store, { sku: "1", price: 20000 }, UID);
    expect(r).toEqual({ sku: "1", price: 20000, finalPrice: 18000, stock: 3, commissionPerUnit: null, discountRemoved: false });
    expect(store.imports[0]?.record).toMatchObject({ kind: "update", updated: 1 });
  });

  it("descuento fijo inválido con el precio nuevo: se elimina", async () => {
    const store = seeded();
    const r = await handleUpdateProductCommerce(store, { sku: "2", price: 900 }, UID);
    expect(r).toMatchObject({ price: 900, finalPrice: 900, discountRemoved: true });
    expect(store.product("2")["discount"]).toBeNull();
  });

  it("define y borra la comisión sin tocar precio ni stock", async () => {
    const store = seeded();
    const r = await handleUpdateProductCommerce(store, { sku: "1", commissionPerUnit: 1500 }, UID);
    expect(r).toMatchObject({ price: 10000, stock: 3, commissionPerUnit: 1500 });
    expect(store.product("1")["commissionPerUnit"]).toBe(1500);
    await handleUpdateProductCommerce(store, { sku: "1", commissionPerUnit: null }, UID);
    expect(store.product("1")["commissionPerUnit"]).toBeNull();
  });

  it("rechaza una comisión sobre el tope o con decimales", async () => {
    const store = seeded();
    await expect(handleUpdateProductCommerce(store, { sku: "1", commissionPerUnit: 10_000_001 }, UID)).rejects.toThrow();
    await expect(handleUpdateProductCommerce(store, { sku: "1", commissionPerUnit: 1500.5 }, UID)).rejects.toThrow();
  });

  it("stock físico: guarda físico - reservado", async () => {
    const store = seeded();
    const r = await handleUpdateProductCommerce(store, { sku: "1", stock: 10 }, UID);
    expect(r.stock).toBe(8);
    expect(store.product("1")).toMatchObject({ stock: 8, inStock: true });
  });

  it("stock negativo se corrige a 0 y consta en la auditoría", async () => {
    const store = seeded();
    const r = await handleUpdateProductCommerce(store, { sku: "1", stock: -3 }, UID);
    expect(r.stock).toBe(0);
    expect(store.product("1")["inStock"]).toBe(false);
    expect(store.imports[0]?.record.corrected).toEqual([{ row: 1, sku: "1", field: "stock", from: -3, to: 0 }]);
  });

  it("precio y stock a la vez", async () => {
    const store = seeded();
    const r = await handleUpdateProductCommerce(store, { sku: "1", price: "$15.000", stock: "12" }, UID);
    expect(r).toMatchObject({ price: 15000, finalPrice: 13500, stock: 10 });
  });

  it("sin cambios: devuelve lo actual, no escribe ni audita", async () => {
    const store = seeded();
    const r = await handleUpdateProductCommerce(store, { sku: "1", price: 10000 }, UID);
    expect(r).toMatchObject({ price: 10000, finalPrice: 9000, stock: 3 });
    expect(store.imports).toHaveLength(0);
  });

  it("errores del contrato", async () => {
    const store = seeded();
    const err = async (data: unknown) => failure(handleUpdateProductCommerce(store, data, UID));
    expect(await err({ sku: "404", price: 1000 })).toMatchObject({ code: "not-found", details: { code: "SKU_NOT_FOUND" } });
    expect(await err({ sku: "3", price: 1000 })).toMatchObject({ code: "failed-precondition", details: { code: "PRODUCT_DELETED" } });
    expect(codeOf(await err({ sku: "1", price: "abc" }))).toBe("INVALID_PRICE");
    expect(codeOf(await err({ sku: "1", price: 0 }))).toBe("INVALID_PRICE");
    expect(codeOf(await err({ sku: "1", price: null }))).toBe("INVALID_PRICE");
    expect(codeOf(await err({ sku: "1", stock: "mucho" }))).toBe("INVALID_STOCK");
    expect(codeOf(await err({ sku: "1", stock: null }))).toBe("EMPTY_STOCK");
    expect(codeOf(await err({ sku: "1", stock: "" }))).toBe("EMPTY_STOCK");
    expect(codeOf(await err({ sku: "1" }))).toBe("INVALID_INPUT");
    expect(codeOf(await err({ sku: "a/b", price: 1000 }))).toBe("INVALID_INPUT");
    expect(codeOf(await err({ sku: "1", price: 1000, finalPrice: 1 }))).toBe("INVALID_INPUT");
    expect(store.product("3")["price"]).toBe(700);
  });
});
