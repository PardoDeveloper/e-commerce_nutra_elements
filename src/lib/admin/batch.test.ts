import { describe, expect, it } from "vitest";
import {
  extractRows,
  normalizeSku,
  parsePrice,
  parseStock,
  planApplyDiscount,
  planImportCatalog,
  planImportPrices,
  planImportStock,
} from "./batch";
import { AdminServiceError } from "./errors";
import { makeProduct } from "./testing";

const products = new Map(
  [
    makeProduct({ sku: "1001", price: 10000, stock: 10, reserved: 3 }),
    makeProduct({ sku: "1002", name: "Con descuento fijo", price: 5000, discount: { type: "fixed", value: 1000 }, finalPrice: 4000 }),
  ].map((p) => [p.sku, p] as const),
);

describe("celdas", () => {
  it("normaliza el SKU como texto", () => {
    expect(normalizeSku(2427844)).toBe("2427844");
    expect(normalizeSku("2427844.0")).toBe("2427844");
    expect(normalizeSku(" AB-1 ")).toBe("AB-1");
    expect(normalizeSku(12.5)).toBeNull();
    expect(normalizeSku("a/b")).toBeNull();
    expect(normalizeSku("")).toBeNull();
    expect(normalizeSku(null)).toBeNull();
  });
  it("interpreta precios chilenos y rechaza decimales", () => {
    expect(parsePrice(12990)).toEqual({ ok: true, value: 12990 });
    expect(parsePrice("12.990")).toEqual({ ok: true, value: 12990 });
    expect(parsePrice("$12.990")).toEqual({ ok: true, value: 12990 });
    expect(parsePrice("12990.00")).toEqual({ ok: true, value: 12990 });
    expect(parsePrice(12990.5).ok).toBe(false);
    expect(parsePrice("12.5").ok).toBe(false);
    expect(parsePrice(0).ok).toBe(false);
    expect(parsePrice(10_000_001).ok).toBe(false);
    expect(parsePrice("abc").ok).toBe(false);
    expect(parsePrice(null).ok).toBe(false);
  });
  it("interpreta el stock: vacío, negativo y texto", () => {
    expect(parseStock(5)).toEqual({ kind: "ok", value: 5 });
    expect(parseStock("7")).toEqual({ kind: "ok", value: 7 });
    expect(parseStock(null).kind).toBe("empty");
    expect(parseStock("  ").kind).toBe("empty");
    expect(parseStock(-3)).toMatchObject({ kind: "corrected", value: 0 });
    expect(parseStock("poco").kind).toBe("invalid");
    expect(parseStock(1.5).kind).toBe("invalid");
  });
});

describe("importPrices", () => {
  it("separa filas válidas e inválidas con su motivo y muestra antes -> después", () => {
    const { report, ops } = planImportPrices(
      [
        { SKU: "1001", PRECIO: 12000 },
        { SKU: "9999", PRECIO: 1000 },
        { SKU: "1001", PRECIO: 1 },
        { SKU: "1002", PRECIO: "abc" },
        { SKU: "1002", PRECIO: 5000 },
        { SKU: null, PRECIO: 100 },
      ],
      products,
      { dryRun: true },
    );
    expect(report.invalid.map((i) => [i.row, i.code])).toEqual([
      [3, "SKU_NOT_FOUND"],
      [4, "DUPLICATE_SKU"],
      [5, "INVALID_PRICE"],
      [6, "DUPLICATE_SKU"],
      [7, "INVALID_SKU"],
    ]);
    expect(report.changes).toEqual([{ row: 2, sku: "1001", name: "Producto de prueba", field: "price", from: 10000, to: 12000 }]);
    expect(report.updated).toBe(1);
    expect(report.unchanged).toBe(0);
    expect(report.skipped).toBe(5);
    expect(report.importId).toBeNull();
    expect(ops).toHaveLength(1);
  });
  it("mismo precio es sin cambios, y un precio que invalida el descuento fijo avisa", () => {
    const same = planImportPrices([{ SKU: "1001", PRECIO: 10000 }], products);
    expect(same.report.unchanged).toBe(1);
    const warn = planImportPrices([{ SKU: "1002", PRECIO: 900 }], products);
    expect(warn.report.warnings[0]?.code).toBe("DISCOUNT_REMOVED");
    expect(warn.ops[0]).toMatchObject({ removeDiscount: true });
  });
  it("lote vacío o demasiado grande se rechaza completo", () => {
    expect(() => planImportPrices([], products)).toThrowError(AdminServiceError);
    const many = Array.from({ length: 1001 }, (_, i) => ({ SKU: String(i), PRECIO: 1 }));
    expect(() => planImportPrices(many, products)).toThrowError(/1000/);
  });
});

describe("importStock", () => {
  it("stock vacío es EMPTY_STOCK y no se toca el producto", () => {
    const { report, ops } = planImportStock([{ SKU: "1001", STOCK: null }], products);
    expect(report.invalid[0]).toMatchObject({ row: 2, code: "EMPTY_STOCK" });
    expect(ops).toEqual([]);
  });
  it("texto no numérico es INVALID_STOCK; negativo se corrige a 0", () => {
    const { report } = planImportStock(
      [
        { SKU: "1001", STOCK: "mucho" },
        { SKU: "1002", STOCK: -4 },
      ],
      products,
    );
    expect(report.invalid[0]?.code).toBe("INVALID_STOCK");
    expect(report.corrected).toEqual([{ row: 3, sku: "1002", field: "stock", from: -4, to: 0 }]);
  });
  it("el stock es físico: se descuenta lo reservado", () => {
    const { report } = planImportStock([{ SKU: "1001", STOCK: 20 }], products);
    expect(report.changes[0]).toMatchObject({ field: "stock", from: 10, to: 17 });
  });
});

describe("importCatalog", () => {
  const row = (over: Record<string, unknown>) => ({
    ID: "5000",
    NOMBRE: "VITAMINA NUEVA X 30 CAPS",
    CODIGO_BARRA: "7800000000009",
    STOCK_ACTUAL: 4,
    PRECIO_VENTA_PUBLICO: 8990,
    ACTIVO: "SI",
    LABORATORIO: "NUTRA ELEMENTS",
    ...over,
  });
  it("crea productos nuevos con stock vacío o negativo en 0 y lo informa", () => {
    const { report, ops } = planImportCatalog([row({ STOCK_ACTUAL: null }), row({ ID: "5001", STOCK_ACTUAL: -2 })] as never, products);
    expect(report.created).toBe(2);
    expect(report.corrected.map((c) => c.sku)).toEqual(["5000", "5001"]);
    expect(ops[0]).toMatchObject({ type: "create", stock: 0 });
  });
  it("en un producto existente, stock vacío es EMPTY_STOCK", () => {
    const { report } = planImportCatalog([row({ ID: "1001", STOCK_ACTUAL: "" })] as never, products);
    expect(report.invalid[0]?.code).toBe("EMPTY_STOCK");
  });
  it("valida ACTIVO, nombre y laboratorio", () => {
    const { report } = planImportCatalog(
      [row({ ACTIVO: "TAL VEZ" }), row({ ID: "5002", NOMBRE: "" }), row({ ID: "5003", LABORATORIO: "OTRO" })] as never,
      products,
    );
    expect(report.invalid.map((i) => i.code)).toEqual(["INVALID_ACTIVE", "INVALID_NAME"]);
    expect(report.warnings[0]?.code).toBe("LABORATORY_MISMATCH");
  });
});

describe("importCatalog: DESCRIPCION (D-046)", () => {
  const row = (over: Record<string, unknown>) => ({
    ID: "1001",
    NOMBRE: "PRODUCTO",
    CODIGO_BARRA: null,
    STOCK_ACTUAL: products.get("1001")!.stock + products.get("1001")!.reserved,
    PRECIO_VENTA_PUBLICO: products.get("1001")!.price,
    ACTIVO: products.get("1001")!.active ? "SI" : "NO",
    LABORATORIO: "NUTRA ELEMENTS",
    ...over,
  });
  it("pisa la descripción de un producto existente cuando la celda trae texto", () => {
    const { report, ops } = planImportCatalog([row({ DESCRIPCION: " Nueva descripción " })] as never, products);
    expect(report.updated).toBe(1);
    expect(report.changes).toMatchObject([{ field: "description", to: "Nueva descripción" }]);
    expect(ops).toEqual([{ type: "update", sku: "1001", description: "Nueva descripción" }]);
  });
  it("vacía no toca la descripción; en un producto nuevo se guarda", () => {
    expect(planImportCatalog([row({ DESCRIPCION: "" })] as never, products).report.unchanged).toBe(1);
    const { ops } = planImportCatalog([row({ ID: "5009", DESCRIPCION: "Texto" })] as never, products);
    expect(ops[0]).toMatchObject({ type: "create", description: "Texto" });
  });
  it("extractRows lee la columna DESCRIPCION", () => {
    const r = extractRows([["ID", "NOMBRE", "DESCRIPCION", "PRECIO_VENTA_PUBLICO", "ACTIVO"], [1, "X", "Hola", 100, "SI"]], "catalog");
    expect(r.ok && r.rows[0]?.DESCRIPCION).toBe("Hola");
  });
});

describe("applyDiscount", () => {
  it("calcula el precio final antes -> después y valida el monto fijo", () => {
    const { report } = planApplyDiscount(["1001", "1002", "7777"], { type: "fixed", value: 6000 }, products, { dryRun: true });
    expect(report.invalid.map((i) => i.code)).toEqual(["DISCOUNT_TOO_HIGH", "SKU_NOT_FOUND"]);
    expect(report.changes).toEqual([{ row: 1, sku: "1001", name: "Producto de prueba", field: "discount", from: 10000, to: 4000 }]);
  });
  it("el porcentaje se redondea al entero más cercano", () => {
    const { report } = planApplyDiscount(["1001"], { type: "percent", value: 15 }, products);
    expect(report.changes[0]?.to).toBe(8500);
  });
  it("quitar el descuento deja el precio de lista; repetir el mismo no cambia", () => {
    const quitar = planApplyDiscount(["1002"], null, products);
    expect(quitar.report.changes[0]).toMatchObject({ from: 4000, to: 5000 });
    const igual = planApplyDiscount(["1002"], { type: "fixed", value: 1000 }, products);
    expect(igual.report.unchanged).toBe(1);
  });
  it("rechaza porcentaje fuera de rango y listas vacías", () => {
    expect(planApplyDiscount(["1001"], { type: "percent", value: 100 }, products).report.invalid[0]?.code).toBe("INVALID_DISCOUNT");
    expect(() => planApplyDiscount([], null, products)).toThrowError(AdminServiceError);
  });
});

describe("extractRows", () => {
  it("busca las columnas sin distinguir mayúsculas ni tildes", () => {
    const r = extractRows([["sku", "Precio"], [1001, 500], [null, null]], "prices");
    expect(r).toEqual({ ok: true, rows: [{ SKU: 1001, PRECIO: 500 }] });
  });
  it("informa las columnas que faltan", () => {
    expect(extractRows([["SKU", "OTRA"], [1, 2]], "stock")).toEqual({ ok: false, missing: ["STOCK"] });
  });
  it("conserva filas vacías intermedias para no desplazar los números de fila", () => {
    const r = extractRows([["SKU", "STOCK"], [1, 1], [null, null], [2, 2]], "stock");
    expect(r.ok && r.rows).toHaveLength(3);
  });
});
