import { describe, expect, it } from "vitest";
import { computeSummary, effectiveThreshold, type CatalogEntry } from "./summary";

const entry = (sku: string, price: number, finalPrice = price, inStock = true): CatalogEntry => ({
  sku,
  name: `Producto ${sku}`,
  slug: `producto-${sku}`,
  categoryId: "vitaminas",
  price,
  finalPrice,
  inStock,
});

const catalog = {
  A: entry("A", 10000),
  B: entry("B", 20000, 17000),
  C: entry("C", 5000, 5000, false),
};

const settings = { shippingFee: 3990, freeShippingThreshold: null as number | null };

describe("computeSummary", () => {
  it("suma subtotal con descuentos y calcula el ahorro", () => {
    const s = computeSummary({
      items: [{ sku: "A", qty: 2 }, { sku: "B", qty: 1 }],
      catalog,
      settings,
      delivery: null,
    });
    expect(s.listSubtotal).toBe(40000);
    expect(s.subtotal).toBe(37000);
    expect(s.discountTotal).toBe(3000);
    expect(s.shipping).toBe(0);
    expect(s.total).toBe(37000);
  });

  it("cobra despacho y no cobra retiro", () => {
    const base = { items: [{ sku: "A", qty: 1 }], catalog, settings };
    expect(computeSummary({ ...base, delivery: "shipping" }).total).toBe(13990);
    expect(computeSummary({ ...base, delivery: "pickup" }).total).toBe(10000);
  });

  it("envío gratis cuando subtotal >= umbral (borde incluido)", () => {
    const s = { shippingFee: 3990, freeShippingThreshold: 10000 };
    const exact = computeSummary({ items: [{ sku: "A", qty: 1 }], catalog, settings: s, delivery: "shipping" });
    expect(exact.freeShippingApplied).toBe(true);
    expect(exact.shipping).toBe(0);
    expect(exact.missingForFreeShipping).toBeNull();
    const below = computeSummary({
      items: [{ sku: "A", qty: 1 }],
      catalog,
      settings: { ...s, freeShippingThreshold: 10001 },
      delivery: "shipping",
    });
    expect(below.freeShippingApplied).toBe(false);
    expect(below.missingForFreeShipping).toBe(1);
  });

  it("el umbral se compara con el subtotal ya descontado", () => {
    const s = { shippingFee: 3990, freeShippingThreshold: 18000 };
    // lista 20000, final 17000: no alcanza 18000
    const r = computeSummary({ items: [{ sku: "B", qty: 1 }], catalog, settings: s, delivery: "shipping" });
    expect(r.freeShippingApplied).toBe(false);
    expect(r.shipping).toBe(3990);
    expect(r.missingForFreeShipping).toBe(1000);
  });

  it("sin umbral (o inválido) no hay envío gratis", () => {
    for (const t of [null, 0, -5, 1.5]) {
      const r = computeSummary({
        items: [{ sku: "A", qty: 5 }],
        catalog,
        settings: { shippingFee: 3990, freeShippingThreshold: t },
        delivery: "shipping",
      });
      expect(r.freeShippingApplied).toBe(false);
      expect(r.shipping).toBe(3990);
    }
    expect(effectiveThreshold(0)).toBeNull();
    expect(effectiveThreshold(30000)).toBe(30000);
  });

  it("excluye los SKU que ya no existen y los informa", () => {
    const r = computeSummary({ items: [{ sku: "A", qty: 1 }, { sku: "ZZ", qty: 3 }], catalog, settings, delivery: null });
    expect(r.missingSkus).toEqual(["ZZ"]);
    expect(r.subtotal).toBe(10000);
  });
});
