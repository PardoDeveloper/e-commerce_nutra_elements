import { describe, expect, it } from "vitest";
import { planCommit, planRelease, planRestock, planSellFromFreeStock, type StockMap } from "./stock.js";
import { planReserve } from "./create-plan.js";
import { order } from "./testing/fixtures.js";

const items = order().items; // 2 x 1001 y 1 x 1002

const map = (a: { stock: number; reserved: number }, b: { stock: number; reserved: number }): StockMap =>
  new Map([
    ["1001", { sku: "1001", ...a }],
    ["1002", { sku: "1002", ...b }],
  ]);

describe("delta de stock", () => {
  it("planReserve: stock -= qty, reserved += qty, inStock recalculado", () => {
    const changes = planReserve(
      [
        { sku: "1001", qty: 2 },
        { sku: "1002", qty: 3 },
      ],
      map({ stock: 5, reserved: 1 }, { stock: 3, reserved: 0 }),
    );
    expect(changes).toEqual([
      { sku: "1001", stock: 3, reserved: 3, inStock: true },
      { sku: "1002", stock: 0, reserved: 3, inStock: false },
    ]);
  });

  it("planReserve rechaza una reserva sin stock (defensa en profundidad)", () => {
    expect(() => planReserve([{ sku: "1001", qty: 6 }], map({ stock: 5, reserved: 0 }, { stock: 3, reserved: 0 }))).toThrow();
  });

  it("planCommit: reserved -= qty y stock intacto", () => {
    const { changes } = planCommit(items, map({ stock: 3, reserved: 2 }, { stock: 2, reserved: 1 }));
    expect(changes).toEqual([
      { sku: "1001", stock: 3, reserved: 0, inStock: true },
      { sku: "1002", stock: 2, reserved: 0, inStock: true },
    ]);
  });

  it("planCommit no deja reserved negativo ante datos inconsistentes", () => {
    const { changes } = planCommit(items, map({ stock: 3, reserved: 0 }, { stock: 2, reserved: 0 }));
    expect(changes.every((c) => c.reserved === 0)).toBe(true);
  });

  it("planRelease: stock += qty, reserved -= qty, inStock vuelve a true", () => {
    const { changes } = planRelease(items, map({ stock: 0, reserved: 2 }, { stock: 0, reserved: 1 }));
    expect(changes).toEqual([
      { sku: "1001", stock: 2, reserved: 0, inStock: true },
      { sku: "1002", stock: 1, reserved: 0, inStock: true },
    ]);
  });

  it("planRestock: stock += qty y reserved intacto", () => {
    const { changes } = planRestock(items, map({ stock: 0, reserved: 4 }, { stock: 7, reserved: 0 }));
    expect(changes).toEqual([
      { sku: "1001", stock: 2, reserved: 4, inStock: true },
      { sku: "1002", stock: 8, reserved: 0, inStock: true },
    ]);
  });

  it("un SKU que ya no existe se informa como faltante y no genera cambios", () => {
    const only1001: StockMap = new Map([["1001", { sku: "1001", stock: 1, reserved: 0 }]]);
    const plan = planRelease(items, only1001);
    expect(plan.missing).toEqual(["1002"]);
    expect(plan.changes.map((c) => c.sku)).toEqual(["1001"]);
  });

  it("planSellFromFreeStock: descuenta stock y no toca reserved", () => {
    const r = planSellFromFreeStock(items, map({ stock: 2, reserved: 5 }, { stock: 1, reserved: 0 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.changes).toEqual([
        { sku: "1001", stock: 0, reserved: 5, inStock: false },
        { sku: "1002", stock: 0, reserved: 0, inStock: false },
      ]);
    }
  });

  it("planSellFromFreeStock falla con el primer SKU sin stock suficiente y reporta lo disponible", () => {
    const r = planSellFromFreeStock(items, map({ stock: 1, reserved: 0 }, { stock: 9, reserved: 0 }));
    expect(r).toEqual({ ok: false, sku: "1001", available: 1 });
  });

  it("planSellFromFreeStock falla si el producto ya no existe", () => {
    const r = planSellFromFreeStock(items, new Map());
    expect(r).toEqual({ ok: false, sku: "1001", available: 0 });
  });
});
