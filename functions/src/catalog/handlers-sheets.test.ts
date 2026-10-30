import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { handleImportCatalog, handleImportPrices, handleImportStock } from "./handlers.js";
import { MemoryStore, productFixture } from "./testing/memory-store.js";

const UID = "admin-1";

function catalogRow(overrides: Record<string, unknown> = {}) {
  return {
    ID: 2427831,
    NOMBRE: "CITRATO DE MAGNESIO X 120 CAPS",
    CODIGO_BARRA: "4006381333931",
    STOCK_ACTUAL: 14,
    PRECIO_VENTA_PUBLICO: 10990,
    ACTIVO: "SI",
    LABORATORIO: "NUTRA ELEMENTS",
    ...overrides,
  };
}

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

describe("importCatalog: producto nuevo", () => {
  it("crea el producto con los valores del contrato y deletedAt: null explícito", async () => {
    const store = new MemoryStore();
    const report = await handleImportCatalog(store, { rows: [catalogRow()], fileName: "productos.xls" }, UID);

    expect(report).toMatchObject({ dryRun: false, rows: 1, created: 1, updated: 0, unchanged: 0, skipped: 0, truncated: false, importId: "imp-1" });
    const p = store.product("2427831");
    expect(p).toMatchObject({
      sku: "2427831",
      sourceName: "CITRATO DE MAGNESIO X 120 CAPS",
      name: "Citrato de Magnesio x 120 cápsulas",
      slug: null,
      categoryId: null,
      images: [],
      price: 10990,
      discount: null,
      finalPrice: 10990,
      stock: 14,
      reserved: 0,
      inStock: true,
      active: true,
      published: false,
      publishedAt: null,
      barcode: "4006381333931",
      barcodeValid: true,
      gtin: "4006381333931",
      unitsPerPack: 120,
      format: "capsulas",
      source: "controlfarma-xls",
      deletedAt: null,
      deletedBy: null,
    });
    expect(p["importedAt"]).toEqual(store.clock);
    expect(p["createdAt"]).toEqual(store.clock);
    expect(Object.hasOwn(p, "deletedAt")).toBe(true);
  });

  it("D-018: stock negativo y vacío pasan a 0 en la importación inicial y constan en corrected", async () => {
    const store = new MemoryStore();
    const report = await handleImportCatalog(
      store,
      { rows: [catalogRow({ ID: 1, STOCK_ACTUAL: -5 }), catalogRow({ ID: 2, STOCK_ACTUAL: null }), catalogRow({ ID: 3, STOCK_ACTUAL: "" })] },
      UID,
    );
    expect(report.created).toBe(3);
    expect(report.corrected).toEqual([
      { row: 2, sku: "1", field: "stock", from: -5, to: 0 },
      { row: 3, sku: "2", field: "stock", from: null, to: 0 },
      { row: 4, sku: "3", field: "stock", from: null, to: 0 },
    ]);
    for (const sku of ["1", "2", "3"]) {
      expect(store.product(sku)).toMatchObject({ stock: 0, inStock: false });
    }
  });

  it("ACTIVO NO crea el producto inactivo; advertencias de laboratorio e ISBN no bloquean", async () => {
    const store = new MemoryStore();
    const report = await handleImportCatalog(
      store,
      { rows: [catalogRow({ ACTIVO: "no", LABORATORIO: "OTRO LAB", CODIGO_BARRA: "9780306406157" })] },
      UID,
    );
    expect(report.created).toBe(1);
    expect(store.product("2427831")).toMatchObject({ active: false, gtin: null, barcode: "9780306406157", barcodeValid: true });
    expect(report.warnings.map((w) => w.code).sort()).toEqual(["BARCODE_ISBN_RANGE", "LABORATORY_MISMATCH"]);
  });

  it("filas inválidas se informan y el resto se aplica", async () => {
    const store = new MemoryStore();
    const rows = [
      catalogRow({ ID: 10 }), // fila 2: OK
      catalogRow({ ID: "a/b" }), // fila 3: INVALID_SKU
      catalogRow({ ID: 10 }), // fila 4: DUPLICATE_SKU
      catalogRow({ ID: 11, NOMBRE: "   " }), // fila 5: INVALID_NAME
      catalogRow({ ID: 12, PRECIO_VENTA_PUBLICO: "abc" }), // fila 6: INVALID_PRICE
      catalogRow({ ID: 13, ACTIVO: "TAL VEZ" }), // fila 7: INVALID_ACTIVE
      catalogRow({ ID: 14, STOCK_ACTUAL: "mucho" }), // fila 8: INVALID_STOCK
      catalogRow({ ID: 15 }), // fila 9: OK
    ];
    const report = await handleImportCatalog(store, { rows }, UID);
    expect(report.created).toBe(2);
    expect(report.skipped).toBe(6);
    expect(report.invalid.map((r) => [r.row, r.code])).toEqual([
      [3, "INVALID_SKU"],
      [4, "DUPLICATE_SKU"],
      [5, "INVALID_NAME"],
      [6, "INVALID_PRICE"],
      [7, "INVALID_ACTIVE"],
      [8, "INVALID_STOCK"],
    ]);
    expect(report.invalid[1]?.sku).toBe("10");
    expect([...store.products.keys()].sort()).toEqual(["10", "15"]);
  });

  it("D-046: DESCRIPCION se guarda en description; vacía o ausente deja description en null", async () => {
    const store = new MemoryStore();
    await handleImportCatalog(
      store,
      { rows: [catalogRow({ ID: 1, DESCRIPCION: "  Aporta magnesio.\r\nFormato de 120.  " }), catalogRow({ ID: 2, DESCRIPCION: "" }), catalogRow({ ID: 3 })] },
      UID,
    );
    expect(store.product("1")["description"]).toBe("Aporta magnesio.\nFormato de 120.");
    expect(store.product("2")["description"]).toBeNull();
    expect(store.product("3")["description"]).toBeNull();
  });

  it("D-046: DESCRIPCION demasiado larga se advierte y no bloquea la fila", async () => {
    const store = new MemoryStore();
    const report = await handleImportCatalog(store, { rows: [catalogRow({ DESCRIPCION: "a".repeat(5001) })] }, UID);
    expect(report.created).toBe(1);
    expect(report.warnings.map((w) => w.code)).toEqual(["INVALID_DESCRIPTION"]);
    expect(store.product("2427831")["description"]).toBeNull();
  });

  it("registra la auditoría en imports", async () => {
    const store = new MemoryStore();
    await handleImportCatalog(store, { rows: [catalogRow(), catalogRow({ ID: "mal/sku" })], fileName: "productos.xls" }, UID);
    expect(store.imports).toHaveLength(1);
    expect(store.imports[0]?.record).toMatchObject({
      kind: "catalog",
      dryRun: false,
      fileName: "productos.xls",
      rows: 2,
      created: 1,
      skipped: 1,
      createdBy: UID,
      truncated: false,
    });
  });
});

describe("importCatalog: reimportación (P13)", () => {
  function seeded() {
    const store = new MemoryStore();
    store.seedProduct(
      "2427831",
      productFixture("2427831", {
        sourceName: "CITRATO DE MAGNESIO X 120 CAPS",
        name: "Nombre editado por el admin",
        slug: "citrato-de-magnesio-120",
        description: "Texto",
        categoryId: "magnesio",
        images: [{ path: "products/2427831/a.webp", alt: "x" }],
        published: true,
        publishedAt: new Date("2026-10-02T00:00:00Z"),
        price: 10000,
        finalPrice: 9000,
        discount: { type: "percent", value: 10 },
        stock: 3,
        reserved: 2,
        inStock: true,
        barcode: "4006381333931",
        barcodeValid: true,
        gtin: "4006381333931",
      }),
    );
    return store;
  }

  it("pisa precio y stock y NO toca contenido, publicación ni descuento", async () => {
    const store = seeded();
    const report = await handleImportCatalog(store, { rows: [catalogRow({ PRECIO_VENTA_PUBLICO: 20000, STOCK_ACTUAL: 12 })] }, UID);
    expect(report).toMatchObject({ created: 0, updated: 1, unchanged: 0 });
    expect(store.product("2427831")).toMatchObject({
      name: "Nombre editado por el admin",
      slug: "citrato-de-magnesio-120",
      description: "Texto",
      categoryId: "magnesio",
      published: true,
      discount: { type: "percent", value: 10 },
      price: 20000,
      finalPrice: 18000, // el descuento sigue y se recalcula
      stock: 10, // 12 físico - 2 reservados
      inStock: true,
      importedAt: store.clock,
    });
    expect(store.product("2427831")["images"]).toEqual([{ path: "products/2427831/a.webp", alt: "x" }]);
  });

  it("D-046: DESCRIPCION con texto pisa la descripción; vacía no la toca", async () => {
    const store = seeded();
    const report = await handleImportCatalog(store, { rows: [catalogRow({ PRECIO_VENTA_PUBLICO: 10000, STOCK_ACTUAL: 5, DESCRIPCION: "Nueva" })] }, UID);
    expect(report).toMatchObject({ updated: 1, unchanged: 0 });
    expect(report.changes).toEqual([{ row: 2, sku: "2427831", name: "Nombre editado por el admin", field: "description", from: "Texto", to: "Nueva" }]);
    expect(store.product("2427831")).toMatchObject({ description: "Nueva", name: "Nombre editado por el admin" });

    const empty = await handleImportCatalog(store, { rows: [catalogRow({ PRECIO_VENTA_PUBLICO: 10000, STOCK_ACTUAL: 5, DESCRIPCION: null })] }, UID);
    expect(empty).toMatchObject({ updated: 0, unchanged: 1 });
    expect(store.product("2427831")["description"]).toBe("Nueva");
  });

  it("es idempotente: repetir la misma planilla da unchanged y no escribe", async () => {
    const store = seeded();
    const row = catalogRow({ PRECIO_VENTA_PUBLICO: 20000, STOCK_ACTUAL: 12 });
    await handleImportCatalog(store, { rows: [row] }, UID);
    const before = structuredClone(store.product("2427831"));
    store.clock = new Date("2026-10-20T00:00:00Z");
    const second = await handleImportCatalog(store, { rows: [row] }, UID);
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(store.product("2427831")).toEqual(before);
  });

  it("celda de stock vacía en un producto existente: EMPTY_STOCK y el producto no cambia", async () => {
    const store = seeded();
    const before = structuredClone(store.product("2427831"));
    const report = await handleImportCatalog(store, { rows: [catalogRow({ STOCK_ACTUAL: null, PRECIO_VENTA_PUBLICO: 99999 })] }, UID);
    expect(report.invalid).toMatchObject([{ row: 2, sku: "2427831", code: "EMPTY_STOCK" }]);
    expect(report.updated).toBe(0);
    expect(store.product("2427831")).toEqual(before);
  });

  it("stock negativo en un producto existente se corrige a 0", async () => {
    const store = seeded();
    const report = await handleImportCatalog(store, { rows: [catalogRow({ STOCK_ACTUAL: -4 })] }, UID);
    expect(report.corrected).toEqual([{ row: 2, sku: "2427831", field: "stock", from: -4, to: 0 }]);
    expect(store.product("2427831")).toMatchObject({ stock: 0, inStock: false });
  });

  it("descuento fijo que queda inválido con el precio nuevo: DISCOUNT_REMOVED", async () => {
    const store = new MemoryStore();
    store.seedProduct("2427831", productFixture("2427831", { price: 10000, discount: { type: "fixed", value: 5000 }, finalPrice: 5000, stock: 3 }));
    const report = await handleImportCatalog(store, { rows: [catalogRow({ PRECIO_VENTA_PUBLICO: 4000, STOCK_ACTUAL: 3 })] }, UID);
    expect(report.warnings).toContainEqual(expect.objectContaining({ code: "DISCOUNT_REMOVED", sku: "2427831" }));
    expect(store.product("2427831")).toMatchObject({ price: 4000, finalPrice: 4000, discount: null });
  });

  it("un SKU eliminado NO se revive: PRODUCT_DELETED y el documento no cambia", async () => {
    const store = new MemoryStore();
    store.seedProduct("2427831", productFixture("2427831", { deletedAt: new Date("2026-10-10"), deletedBy: "u0", price: 500, stock: 1 }));
    const before = structuredClone(store.product("2427831"));
    const report = await handleImportCatalog(store, { rows: [catalogRow(), catalogRow({ ID: 7 })] }, UID);
    expect(report.invalid).toMatchObject([{ row: 2, sku: "2427831", code: "PRODUCT_DELETED" }]);
    expect(report.created).toBe(1);
    expect(store.product("2427831")).toEqual(before);
    expect(store.products.has("7")).toBe(true);
  });

  it("documento dañado: INVALID_PRODUCT_DATA, sin cambios", async () => {
    const store = new MemoryStore();
    store.seedProduct("2427831", productFixture("2427831", { price: "mucho" }));
    const report = await handleImportCatalog(store, { rows: [catalogRow()] }, UID);
    expect(report.invalid[0]?.code).toBe("INVALID_PRODUCT_DATA");
    expect(store.product("2427831")["price"]).toBe("mucho");
  });

  it("documento antiguo sin deletedAt: al actualizar se completa con null", async () => {
    const store = new MemoryStore();
    const old = productFixture("2427831", { price: 1000, stock: 1 });
    delete old["deletedAt"];
    delete old["deletedBy"];
    store.seedProduct("2427831", old);
    await handleImportCatalog(store, { rows: [catalogRow({ PRECIO_VENTA_PUBLICO: 2000, STOCK_ACTUAL: 1 })] }, UID);
    expect(store.product("2427831")).toMatchObject({ deletedAt: null, deletedBy: null, price: 2000 });
  });
});

describe("lotes: tamaño, dryRun, transacciones y reintentos", () => {
  const manyRows = (n: number, start = 1) => Array.from({ length: n }, (_, i) => catalogRow({ ID: start + i, NOMBRE: `PRODUCTO ${start + i}` }));

  it("parte el lote en transacciones de 200 productos", async () => {
    const store = new MemoryStore();
    const report = await handleImportCatalog(store, { rows: manyRows(450) }, UID);
    expect(report.created).toBe(450);
    expect(store.transactions).toBe(3);
    expect(store.products.size).toBe(450);
    expect(store.imports).toHaveLength(1);
  });

  it("1000 filas pasan; 1001 es TOO_MANY_ROWS; vacío es EMPTY_BATCH (sin escribir nada)", async () => {
    const store = new MemoryStore();
    expect((await handleImportCatalog(store, { rows: manyRows(1000) }, UID)).created).toBe(1000);

    const store2 = new MemoryStore();
    const tooMany = await failure(handleImportCatalog(store2, { rows: manyRows(1001) }, UID));
    expect(codeOf(tooMany)).toBe("TOO_MANY_ROWS");
    expect(tooMany.code).toBe("invalid-argument");
    const empty = await failure(handleImportCatalog(store2, { rows: [] }, UID));
    expect(codeOf(empty)).toBe("EMPTY_BATCH");
    expect(store2.products.size).toBe(0);
    expect(store2.imports).toHaveLength(0);
  });

  it("dryRun: devuelve el reporte sin escribir ni crear imports", async () => {
    const store = new MemoryStore();
    store.seedProduct("1", productFixture("1", { price: 100 }));
    const report = await handleImportCatalog(store, { dryRun: true, rows: [catalogRow({ ID: 1, PRECIO_VENTA_PUBLICO: 500, STOCK_ACTUAL: 5 }), catalogRow({ ID: 2 })] }, UID);
    expect(report).toMatchObject({ dryRun: true, importId: null, created: 1, updated: 1 });
    expect(report.changes.map((c) => c.field)).toContain("create");
    expect(store.product("1")["price"]).toBe(100);
    expect(store.products.has("2")).toBe(false);
    expect(store.imports).toHaveLength(0);
  });

  it("la planificación se puede repetir (reintento de la transacción) sin efectos dobles", async () => {
    const store = new MemoryStore({ simulateRetry: true });
    const report = await handleImportCatalog(store, { rows: manyRows(250) }, UID);
    expect(report).toMatchObject({ created: 250, updated: 0 });
    expect(store.products.size).toBe(250);
  });

  it("si falla un trozo, los anteriores quedan aplicados y se deja un registro parcial", async () => {
    const store = new MemoryStore({ failTransactionNumber: 2 });
    await expect(handleImportCatalog(store, { rows: manyRows(450) }, UID)).rejects.toThrow("Fallo simulado");
    expect(store.products.size).toBe(200);
    expect(store.imports).toHaveLength(1);
    expect(store.imports[0]?.record.warnings.map((w) => w.code)).toContain("PARTIAL_FAILURE");
    // Repetir es seguro: lo ya creado pasa a "unchanged" y se crea el resto.
    store.options = {};
    const retry = await handleImportCatalog(store, { rows: manyRows(450) }, UID);
    expect(retry).toMatchObject({ created: 250, unchanged: 200, updated: 0 });
    expect(store.products.size).toBe(450);
  });

  it("las listas del reporte se recortan a 500 y se marca truncated; skipped cuenta todas", async () => {
    const store = new MemoryStore();
    const rows = Array.from({ length: 600 }, () => catalogRow({ ID: "###" }));
    const report = await handleImportCatalog(store, { rows }, UID);
    expect(report.skipped).toBe(600);
    expect(report.invalid).toHaveLength(500);
    expect(report.truncated).toBe(true);
    expect(store.imports[0]?.record.invalid).toHaveLength(500);
  });

  it("rechaza campos desconocidos, tipos incorrectos y celdas con objetos (INVALID_INPUT)", async () => {
    const store = new MemoryStore();
    expect(codeOf(await failure(handleImportCatalog(store, { rows: [catalogRow()], extra: 1 }, UID)))).toBe("INVALID_INPUT");
    expect(codeOf(await failure(handleImportCatalog(store, { rows: "x" }, UID)))).toBe("INVALID_INPUT");
    expect(codeOf(await failure(handleImportCatalog(store, null, UID)))).toBe("INVALID_INPUT");
    const bad = await failure(handleImportCatalog(store, { rows: [{ ID: { $gt: "" } }] }, UID));
    expect(codeOf(bad)).toBe("INVALID_INPUT");
    expect(bad.details).toMatchObject({ fields: [{ path: "rows.0.ID" }] });
    expect(codeOf(await failure(handleImportCatalog(store, { rows: [catalogRow()], dryRun: "si" }, UID)))).toBe("INVALID_INPUT");
  });

  it("ignora columnas extra dentro de las filas", async () => {
    const store = new MemoryStore();
    const report = await handleImportCatalog(store, { rows: [{ ...catalogRow(), OTRA: "x" }] }, UID);
    expect(report.created).toBe(1);
  });
});

describe("importPrices", () => {
  function seeded() {
    const store = new MemoryStore();
    store.seedProduct("1", productFixture("1", { price: 1000, finalPrice: 1000 }));
    store.seedProduct("2", productFixture("2", { price: 2000, finalPrice: 1800, discount: { type: "percent", value: 10 } }));
    store.seedProduct("3", productFixture("3", { price: 5000, finalPrice: 4000, discount: { type: "fixed", value: 1000 } }));
    store.seedProduct("4", productFixture("4", { deletedAt: new Date("2026-10-01"), price: 700 }));
    return store;
  }

  it("actualiza, informa filas inválidas y aplica el resto", async () => {
    const store = seeded();
    const rows = [
      { SKU: 1, PRECIO: "$1.500" }, // actualizado
      { SKU: "2", PRECIO: 4000 }, // actualizado, conserva el 10%
      { SKU: 3, PRECIO: 800 }, // actualizado, descuento fijo inválido
      { SKU: 4, PRECIO: 900 }, // eliminado
      { SKU: 99, PRECIO: 900 }, // no existe
      { SKU: 1, PRECIO: 900 }, // duplicado
      { SKU: 2.5, PRECIO: 900 }, // sku inválido
      { SKU: 3, PRECIO: 0 }, // duplicado (se detecta antes que el precio)
    ];
    const report = await handleImportPrices(store, { rows }, UID);
    expect(report).toMatchObject({ rows: 8, updated: 3, created: 0, unchanged: 0, skipped: 5 });
    expect(report.invalid.map((r) => [r.row, r.code])).toEqual([
      [5, "PRODUCT_DELETED"],
      [6, "SKU_NOT_FOUND"],
      [7, "DUPLICATE_SKU"],
      [8, "INVALID_SKU"],
      [9, "DUPLICATE_SKU"],
    ]);
    expect(store.product("1")).toMatchObject({ price: 1500, finalPrice: 1500 });
    expect(store.product("2")).toMatchObject({ price: 4000, finalPrice: 3600, discount: { type: "percent", value: 10 } });
    expect(store.product("3")).toMatchObject({ price: 800, finalPrice: 800, discount: null });
    expect(store.product("4")["price"]).toBe(700);
    expect(report.warnings).toEqual([expect.objectContaining({ code: "DISCOUNT_REMOVED", sku: "3" })]);
    expect(store.imports[0]?.record.kind).toBe("price");
  });

  it("precio inválido por fila y mismo precio = unchanged", async () => {
    const store = seeded();
    const report = await handleImportPrices(store, { rows: [{ SKU: 1, PRECIO: 1000 }, { SKU: 2, PRECIO: "abc" }, { SKU: 3, PRECIO: 10_000_001 }] }, UID);
    expect(report.unchanged).toBe(1);
    expect(report.invalid.map((r) => r.code)).toEqual(["INVALID_PRICE", "INVALID_PRICE"]);
  });

  it("dryRun muestra los cambios sin escribir", async () => {
    const store = seeded();
    const report = await handleImportPrices(store, { dryRun: true, rows: [{ SKU: 1, PRECIO: 1500 }] }, UID);
    expect(report.changes).toEqual([{ row: 2, sku: "1", name: "Producto 1", field: "price", from: 1000, to: 1500 }]);
    expect(store.product("1")["price"]).toBe(1000);
    expect(store.imports).toHaveLength(0);
  });
});

describe("importStock", () => {
  function seeded() {
    const store = new MemoryStore();
    store.seedProduct("1", productFixture("1", { stock: 5, reserved: 2 }));
    store.seedProduct("2", productFixture("2", { stock: 0, reserved: 0, inStock: false }));
    store.seedProduct("3", productFixture("3", { stock: 9 }));
    store.seedProduct("4", productFixture("4", { deletedAt: new Date("2026-10-01"), stock: 4 }));
    return store;
  }

  it("guarda stock = físico - reservado y recalcula inStock", async () => {
    const store = seeded();
    const report = await handleImportStock(store, { rows: [{ SKU: 1, STOCK: 10 }, { SKU: 2, STOCK: 3 }] }, UID);
    expect(report.updated).toBe(2);
    expect(store.product("1")).toMatchObject({ stock: 8, inStock: true });
    expect(store.product("2")).toMatchObject({ stock: 3, inStock: true });
    expect(store.imports[0]?.record.kind).toBe("stock");
  });

  it("físico menor que lo reservado deja 0 e inStock false", async () => {
    const store = seeded();
    await handleImportStock(store, { rows: [{ SKU: 1, STOCK: 1 }] }, UID);
    expect(store.product("1")).toMatchObject({ stock: 0, inStock: false });
  });

  it("D-024: celda vacía = EMPTY_STOCK (no 0); producto sin cambios", async () => {
    const store = seeded();
    const report = await handleImportStock(store, { rows: [{ SKU: 3, STOCK: null }, { SKU: 1, STOCK: "" }, { SKU: 2 }] }, UID);
    expect(report.invalid.map((r) => [r.sku, r.code])).toEqual([["3", "EMPTY_STOCK"], ["1", "EMPTY_STOCK"], ["2", "EMPTY_STOCK"]]);
    expect(report.updated).toBe(0);
    expect(store.product("3")["stock"]).toBe(9);
  });

  it("texto no numérico, negativo corregido, no existe, eliminado, repetido", async () => {
    const store = seeded();
    const report = await handleImportStock(
      store,
      { rows: [{ SKU: 3, STOCK: "mucho" }, { SKU: 1, STOCK: -7 }, { SKU: 99, STOCK: 1 }, { SKU: 4, STOCK: 1 }, { SKU: 1, STOCK: 1 }] },
      UID,
    );
    expect(report.invalid.map((r) => [r.row, r.code])).toEqual([
      [2, "INVALID_STOCK"],
      [4, "SKU_NOT_FOUND"],
      [5, "PRODUCT_DELETED"],
      [6, "DUPLICATE_SKU"],
    ]);
    expect(report.corrected).toEqual([{ row: 3, sku: "1", field: "stock", from: -7, to: 0 }]);
    expect(store.product("1")).toMatchObject({ stock: 0, inStock: false });
    expect(store.product("4")["stock"]).toBe(4);
  });

  it("es idempotente", async () => {
    const store = seeded();
    await handleImportStock(store, { rows: [{ SKU: 3, STOCK: 20 }] }, UID);
    const again = await handleImportStock(store, { rows: [{ SKU: 3, STOCK: 20 }] }, UID);
    expect(again).toMatchObject({ updated: 0, unchanged: 1 });
  });
});
