import { describe, expect, it } from "vitest";
import {
  addItem,
  countItems,
  mergeLines,
  parseStoredCart,
  removeItem,
  setQty,
  subtotalOf,
  toOrderItems,
  type CartItemInput,
} from "./logic";

const a: CartItemInput = { sku: "A1", name: "A", slug: "a", categoryId: "vitaminas", unitPrice: 1000, finalPrice: 900 };
const b: CartItemInput = { sku: "B2", name: "B", slug: "b", categoryId: "magnesio", unitPrice: 2000, finalPrice: 2000 };

describe("carrito (lógica pura)", () => {
  it("fusiona SKU duplicados sumando cantidades (D-027)", () => {
    const lines = addItem(addItem([], a, 2), a, 3);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.qty).toBe(5);
  });

  it("respeta el máximo por producto", () => {
    expect(addItem(addItem([], a, 8), a, 8)[0]?.qty).toBe(10);
  });

  it("cambia la cantidad y quita la línea con cantidad menor que 1", () => {
    const base = addItem(addItem([], a), b);
    expect(setQty(base, "A1", 4).find((l) => l.sku === "A1")?.qty).toBe(4);
    expect(setQty(base, "A1", 0).map((l) => l.sku)).toEqual(["B2"]);
    expect(setQty(base, "A1", Number.NaN).map((l) => l.sku)).toEqual(["B2"]);
  });

  it("quita una línea", () => {
    expect(removeItem(addItem([], a), "A1")).toEqual([]);
  });

  it("calcula contador y subtotal de visualización", () => {
    const lines = addItem(addItem([], a, 2), b, 1);
    expect(countItems(lines)).toBe(3);
    expect(subtotalOf(lines)).toBe(900 * 2 + 2000);
  });

  it("toOrderItems envía solo sku y qty, sin duplicados", () => {
    const lines = [
      { ...a, qty: 1 },
      { ...a, qty: 2 },
    ];
    expect(toOrderItems(lines)).toEqual([{ sku: "A1", qty: 3 }]);
  });

  it("parseStoredCart descarta basura y fusiona duplicados", () => {
    expect(parseStoredCart(null)).toEqual([]);
    expect(parseStoredCart("no es json")).toEqual([]);
    expect(parseStoredCart('{"x":1}')).toEqual([]);
    const raw = JSON.stringify([{ ...a, qty: 1 }, { ...a, qty: 2 }, { sku: "../x", qty: 1 }, 5]);
    const parsed = parseStoredCart(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.qty).toBe(3);
  });

  it("mergeLines acota cantidades inválidas", () => {
    expect(mergeLines([{ ...a, qty: 99 }])[0]?.qty).toBe(10);
    expect(mergeLines([{ ...a, qty: -3 }])[0]?.qty).toBe(1);
  });
});
