import { describe, expect, it } from "vitest";
import { availableStock, planPriceChange, sameDiscount, validateDiscount } from "./discount.js";
import { readProduct } from "./product.js";
import { productFixture } from "./testing/memory-store.js";

describe("validateDiscount", () => {
  it("porcentaje entero de 1 a 99", () => {
    expect(validateDiscount(1000, { type: "percent", value: 1 })).toBeNull();
    expect(validateDiscount(1000, { type: "percent", value: 99 })).toBeNull();
    expect(validateDiscount(1000, { type: "percent", value: 0 })).toBe("INVALID_DISCOUNT");
    expect(validateDiscount(1000, { type: "percent", value: 100 })).toBe("INVALID_DISCOUNT");
    expect(validateDiscount(1000, { type: "percent", value: 10.5 })).toBe("INVALID_DISCOUNT");
  });
  it("monto fijo: >= 1 y menor que el precio", () => {
    expect(validateDiscount(1000, { type: "fixed", value: 999 })).toBeNull();
    expect(validateDiscount(1000, { type: "fixed", value: 1000 })).toBe("DISCOUNT_TOO_HIGH");
    expect(validateDiscount(1000, { type: "fixed", value: 5000 })).toBe("DISCOUNT_TOO_HIGH");
    expect(validateDiscount(1000, { type: "fixed", value: 0 })).toBe("INVALID_DISCOUNT");
  });
});

describe("sameDiscount", () => {
  it("compara tipo y valor, y trata null", () => {
    expect(sameDiscount(null, null)).toBe(true);
    expect(sameDiscount(null, { type: "percent", value: 5 })).toBe(false);
    expect(sameDiscount({ type: "percent", value: 5 }, { type: "percent", value: 5 })).toBe(true);
    expect(sameDiscount({ type: "percent", value: 5 }, { type: "fixed", value: 5 })).toBe(false);
  });
});

describe("planPriceChange", () => {
  const product = (overrides: Record<string, unknown>) => {
    const p = readProduct("1", productFixture("1", overrides));
    if (!p) throw new Error("fixture inválido");
    return p;
  };

  it("sin cambio de precio devuelve null", () => {
    expect(planPriceChange(product({}), 10000)).toBeNull();
  });
  it("sin descuento: finalPrice = precio", () => {
    expect(planPriceChange(product({}), 12000)).toEqual({ patch: { price: 12000, finalPrice: 12000 }, discountRemoved: false });
  });
  it("con descuento porcentual: recalcula finalPrice y lo conserva", () => {
    const p = product({ discount: { type: "percent", value: 10 }, finalPrice: 9000 });
    expect(planPriceChange(p, 20000)).toEqual({ patch: { price: 20000, finalPrice: 18000 }, discountRemoved: false });
  });
  it("descuento fijo que sigue siendo válido se conserva", () => {
    const p = product({ discount: { type: "fixed", value: 1000 }, finalPrice: 9000 });
    expect(planPriceChange(p, 15000)).toEqual({ patch: { price: 15000, finalPrice: 14000 }, discountRemoved: false });
  });
  it("descuento fijo que deja de ser válido se elimina (DISCOUNT_REMOVED)", () => {
    const p = product({ discount: { type: "fixed", value: 1000 }, finalPrice: 9000 });
    expect(planPriceChange(p, 800)).toEqual({ patch: { price: 800, finalPrice: 800, discount: null }, discountRemoved: true });
  });
});

describe("availableStock", () => {
  it("descuenta lo reservado y no baja de 0", () => {
    expect(availableStock(10, 3)).toBe(7);
    expect(availableStock(2, 5)).toBe(0);
  });
});

describe("readProduct", () => {
  it("documento válido", () => {
    const p = readProduct("1", productFixture("1"));
    expect(p).toMatchObject({ sku: "1", price: 10000, deleted: false, deletedFieldsMissing: false });
  });
  it("detecta eliminado y campo deletedAt ausente", () => {
    expect(readProduct("1", productFixture("1", { deletedAt: new Date() }))?.deleted).toBe(true);
    const old = productFixture("1");
    delete old["deletedAt"];
    expect(readProduct("1", old)).toMatchObject({ deleted: false, deletedFieldsMissing: true });
  });
  it.each([
    { price: 12.5 },
    { price: 0 },
    { stock: -1 },
    { reserved: -1 },
    { active: "si" },
    { discount: { type: "otro", value: 1 } },
  ])("datos dañados %j -> null", (overrides) => {
    expect(readProduct("1", productFixture("1", overrides))).toBeNull();
  });
});
