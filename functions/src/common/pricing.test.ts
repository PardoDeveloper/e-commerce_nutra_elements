import { describe, expect, it } from "vitest";
import { getAppErrorCode } from "./errors.js";
import {
  computeFinalPrice,
  computePricing,
  type PricingDelivery,
  type PricingProduct,
  type PricingSettings,
} from "./pricing.js";

function product(sku: string, over: Partial<PricingProduct> = {}): PricingProduct {
  return { sku, name: `Producto ${sku}`, price: 10_000, discount: null, published: true, active: true, stock: 100, ...over };
}

function mapOf(...ps: PricingProduct[]): Map<string, PricingProduct> {
  return new Map(ps.map((p) => [p.sku, p]));
}

const SETTINGS: PricingSettings = {
  shippingFee: 3990,
  freeShippingThreshold: null,
  communes: [
    { code: "puente-alto", name: "Puente Alto" },
    { code: "santiago", name: "Santiago" },
  ],
  pickup: { enabled: true },
  maxQtyPerItem: 10,
};

const SHIP: PricingDelivery = { type: "shipping", communeCode: "puente-alto" };
const PICKUP: PricingDelivery = { type: "pickup" };

function errorOf(fn: () => unknown): { code: string | undefined; details: unknown } {
  try {
    fn();
  } catch (e) {
    return { code: getAppErrorCode(e), details: (e as { details?: unknown }).details };
  }
  return { code: undefined, details: undefined };
}

describe("computeFinalPrice (data-model.md 7.3)", () => {
  it.each([
    // [precio, descuento, esperado, nota]
    [12990, { type: "percent", value: 10 }, 11691, "ejemplo del contrato"],
    [9990, { type: "percent", value: 15 }, 8492, "8491,5 redondea hacia arriba"],
    [5990, { type: "fixed", value: 1000 }, 4990, "ejemplo del contrato"],
    [10000, { type: "percent", value: 99 }, 100, "99%"],
    [10000, { type: "percent", value: 1 }, 9900, "1%"],
    [10000, { type: "fixed", value: 9999 }, 1, "fijo = precio - 1"],
    [10000, { type: "fixed", value: 10000 }, 0, "fijo = precio: no baja de 0"],
    [10000, { type: "fixed", value: 25000 }, 0, "descuento mayor que el precio: tope en 0"],
    [10000, { type: "percent", value: 100 }, 0, "100% fuera de contrato: 0"],
    [10000, { type: "percent", value: 250 }, 0, "más de 100%: 0, nunca negativo"],
    [1, { type: "percent", value: 50 }, 1, "0,5 sube a 1 (mitad hacia arriba)"],
    [1, { type: "percent", value: 49 }, 1, "0,51 -> 1"],
    [3, { type: "percent", value: 50 }, 2, "1,5 -> 2"],
  ] as const)("precio %i con %o -> %i (%s)", (price, discount, expected, _nota) => {
    expect(computeFinalPrice(price, discount)).toBe(expected);
  });

  it("sin descuento devuelve el precio de lista", () => {
    expect(computeFinalPrice(8990, null)).toBe(8990);
    expect(computeFinalPrice(8990, undefined)).toBe(8990);
  });

  it("nunca supera el precio ni baja de 0", () => {
    expect(computeFinalPrice(5000, { type: "fixed", value: 0 })).toBe(5000);
    expect(computeFinalPrice(5000, { type: "percent", value: 0 })).toBe(5000);
  });

  it("datos corruptos lanzan INTERNAL", () => {
    expect(errorOf(() => computeFinalPrice(0, null)).code).toBe("INTERNAL");
    expect(errorOf(() => computeFinalPrice(10.5, null)).code).toBe("INTERNAL");
    expect(errorOf(() => computeFinalPrice(Number.NaN, null)).code).toBe("INTERNAL");
    expect(errorOf(() => computeFinalPrice(100, { type: "percent", value: 10.5 })).code).toBe("INTERNAL");
    expect(errorOf(() => computeFinalPrice(100, { type: "fixed", value: -5 })).code).toBe("INTERNAL");
    expect(errorOf(() => computeFinalPrice(100, { type: "otro", value: 5 } as never)).code).toBe("INTERNAL");
  });
});

describe("computePricing: caso base", () => {
  it("replica el ejemplo del modelo de datos (NE-000123)", () => {
    const products = mapOf(
      product("2427831", { name: "Citrato de Magnesio x 120 cápsulas", price: 10990, discount: { type: "percent", value: 10 } }),
      product("2427851", { name: "Vitamina C x 60 cápsulas", price: 8990 }),
    );
    const r = computePricing({
      items: [
        { sku: "2427831", qty: 2 },
        { sku: "2427851", qty: 1 },
      ],
      products,
      settings: SETTINGS,
      delivery: SHIP,
    });
    expect(r.lines[0]).toEqual({
      sku: "2427831",
      name: "Citrato de Magnesio x 120 cápsulas",
      unitPrice: 10990,
      discount: { type: "percent", value: 10 },
      unitFinalPrice: 9891,
      qty: 2,
      lineTotal: 19782,
    });
    expect(r.lines[1]?.discount).toBeNull();
    expect(r.subtotal).toBe(28772);
    expect(r.listSubtotal).toBe(10990 * 2 + 8990);
    expect(r.discountTotal).toBe(r.listSubtotal - 28772);
    expect(r.discountTotal).toBe((10990 - 9891) * 2);
    expect(r.shipping).toBe(3990);
    expect(r.total).toBe(32762);
    expect(r.freeShippingApplied).toBe(false);
    expect(r.delivery).toEqual({ type: "shipping", communeCode: "puente-alto", communeName: "Puente Alto" });
  });

  it("ignora el finalPrice guardado en el producto (se recalcula)", () => {
    const tampered = { ...product("A", { price: 10000, discount: { type: "percent", value: 10 } }), finalPrice: 1 };
    const r = computePricing({ items: [{ sku: "A", qty: 1 }], products: mapOf(tampered), settings: SETTINGS, delivery: PICKUP });
    expect(r.subtotal).toBe(9000);
  });

  it("no comparte la referencia del descuento del producto", () => {
    const p = product("A", { discount: { type: "fixed", value: 500 } });
    const r = computePricing({ items: [{ sku: "A", qty: 1 }], products: mapOf(p), settings: SETTINGS, delivery: PICKUP });
    expect(r.lines[0]?.discount).toEqual({ type: "fixed", value: 500 });
    expect(r.lines[0]?.discount).not.toBe(p.discount);
  });
});

describe("computePricing: descuentos", () => {
  it("descuento fijo mayor que el precio deja la línea en 0 y el total no es negativo", () => {
    const products = mapOf(
      product("A", { price: 5000, discount: { type: "fixed", value: 20000 } }),
      product("B", { price: 3000 }),
    );
    const r = computePricing({
      items: [
        { sku: "A", qty: 2 },
        { sku: "B", qty: 1 },
      ],
      products,
      settings: SETTINGS,
      delivery: PICKUP,
    });
    expect(r.lines[0]?.unitFinalPrice).toBe(0);
    expect(r.lines[0]?.lineTotal).toBe(0);
    expect(r.subtotal).toBe(3000);
    expect(r.discountTotal).toBe(10000);
    expect(r.total).toBe(3000);
  });

  it("todo en 0 con retiro -> ZERO_TOTAL", () => {
    const products = mapOf(product("A", { price: 5000, discount: { type: "fixed", value: 5000 } }));
    expect(errorOf(() => computePricing({ items: [{ sku: "A", qty: 1 }], products, settings: SETTINGS, delivery: PICKUP })).code).toBe(
      "ZERO_TOTAL",
    );
  });

  it("todo en 0 con despacho: el total es el envío (> 0), no ZERO_TOTAL", () => {
    const products = mapOf(product("A", { price: 5000, discount: { type: "fixed", value: 5000 } }));
    const r = computePricing({ items: [{ sku: "A", qty: 1 }], products, settings: SETTINGS, delivery: SHIP });
    expect(r.total).toBe(3990);
  });
});

describe("computePricing: envío", () => {
  const products = mapOf(product("A", { price: 10000 }));
  const base = { items: [{ sku: "A", qty: 1 }], products };

  it("retiro en tienda cuesta 0 y no marca envío gratis", () => {
    const r = computePricing({ ...base, settings: { ...SETTINGS, freeShippingThreshold: 5000 }, delivery: PICKUP });
    expect(r.shipping).toBe(0);
    expect(r.freeShippingApplied).toBe(false);
    expect(r.total).toBe(10000);
    expect(r.delivery).toEqual({ type: "pickup" });
  });

  it("RM con comuna válida cuesta 3.990", () => {
    const r = computePricing({ ...base, settings: SETTINGS, delivery: SHIP });
    expect(r.shipping).toBe(3990);
    expect(r.total).toBe(13990);
  });

  it("umbral sin configurar (null): nunca hay envío gratis, ni con carritos enormes", () => {
    const big = mapOf(product("A", { price: 5_000_000 }));
    const r = computePricing({ items: [{ sku: "A", qty: 5 }], products: big, settings: SETTINGS, delivery: SHIP });
    expect(r.shipping).toBe(3990);
    expect(r.freeShippingApplied).toBe(false);
  });

  it("subtotal exactamente igual al umbral: envío gratis (>=)", () => {
    const r = computePricing({ ...base, settings: { ...SETTINGS, freeShippingThreshold: 10000 }, delivery: SHIP });
    expect(r.shipping).toBe(0);
    expect(r.freeShippingApplied).toBe(true);
    expect(r.total).toBe(10000);
  });

  it("subtotal un peso bajo el umbral: paga envío", () => {
    const r = computePricing({ ...base, settings: { ...SETTINGS, freeShippingThreshold: 10001 }, delivery: SHIP });
    expect(r.shipping).toBe(3990);
    expect(r.freeShippingApplied).toBe(false);
  });

  it("el umbral se compara con el subtotal CON descuentos, no con el precio de lista", () => {
    const discounted = mapOf(product("A", { price: 12000, discount: { type: "percent", value: 25 } })); // 9000
    const r = computePricing({
      items: [{ sku: "A", qty: 1 }],
      products: discounted,
      settings: { ...SETTINGS, freeShippingThreshold: 10000 },
      delivery: SHIP,
    });
    expect(r.listSubtotal).toBe(12000);
    expect(r.subtotal).toBe(9000);
    expect(r.freeShippingApplied).toBe(false);
    expect(r.shipping).toBe(3990);
  });

  it("umbral fuera de contrato (0, negativo, decimal) se ignora: no regala el envío", () => {
    for (const freeShippingThreshold of [0, -1, 1.5, Number.NaN]) {
      const r = computePricing({ ...base, settings: { ...SETTINGS, freeShippingThreshold }, delivery: SHIP });
      expect(r.freeShippingApplied).toBe(false);
      expect(r.shipping).toBe(3990);
    }
  });

  it("tarifa de envío configurada distinta de 3.990 se respeta", () => {
    const r = computePricing({ ...base, settings: { ...SETTINGS, shippingFee: 5990 }, delivery: SHIP });
    expect(r.shipping).toBe(5990);
  });

  it("comuna fuera de la lista -> INVALID_COMMUNE", () => {
    const e = errorOf(() =>
      computePricing({ ...base, settings: SETTINGS, delivery: { type: "shipping", communeCode: "valparaiso" } }),
    );
    expect(e.code).toBe("INVALID_COMMUNE");
  });

  it("el código de comuna distingue mayúsculas (no se normaliza)", () => {
    const e = errorOf(() =>
      computePricing({ ...base, settings: SETTINGS, delivery: { type: "shipping", communeCode: "Puente-Alto" } }),
    );
    expect(e.code).toBe("INVALID_COMMUNE");
  });

  it("retiro desactivado -> PICKUP_DISABLED", () => {
    const e = errorOf(() => computePricing({ ...base, settings: { ...SETTINGS, pickup: { enabled: false } }, delivery: PICKUP }));
    expect(e.code).toBe("PICKUP_DISABLED");
  });

  it("tarifa de envío corrupta -> INTERNAL", () => {
    expect(errorOf(() => computePricing({ ...base, settings: { ...SETTINGS, shippingFee: -1 }, delivery: SHIP })).code).toBe("INTERNAL");
    expect(errorOf(() => computePricing({ ...base, settings: { ...SETTINGS, shippingFee: 10.5 }, delivery: SHIP })).code).toBe("INTERNAL");
  });
});

describe("computePricing: cantidades", () => {
  const products = mapOf(product("A"));
  const run = (qty: number, maxQtyPerItem: number | undefined = 10) =>
    errorOf(() =>
      computePricing({ items: [{ sku: "A", qty }], products, settings: { ...SETTINGS, maxQtyPerItem }, delivery: PICKUP }),
    );

  it.each([0, -1, 1.5, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2])("qty %s -> INVALID_INPUT", (qty) => {
    const e = run(qty);
    expect(e.code).toBe("INVALID_INPUT");
    expect(JSON.stringify(e.details)).toContain("items.0.qty");
  });

  it("qty = maxQtyPerItem es válida y maxQtyPerItem + 1 no", () => {
    expect(run(10).code).toBeUndefined();
    expect(run(11).code).toBe("INVALID_INPUT");
  });

  it("usa el máximo configurado en settings", () => {
    expect(run(11, 20).code).toBeUndefined();
    expect(run(21, 20).code).toBe("INVALID_INPUT");
  });

  it("sin maxQtyPerItem usa 10 por defecto", () => {
    expect(run(10, undefined).code).toBeUndefined();
    expect(run(11, undefined).code).toBe("INVALID_INPUT");
  });

  it("carrito vacío o con más de 20 líneas -> INVALID_INPUT", () => {
    expect(errorOf(() => computePricing({ items: [], products, settings: SETTINGS, delivery: PICKUP })).code).toBe("INVALID_INPUT");
    const many = Array.from({ length: 21 }, (_, i) => product(`S${i}`));
    const r = errorOf(() =>
      computePricing({ items: many.map((p) => ({ sku: p.sku, qty: 1 })), products: mapOf(...many), settings: SETTINGS, delivery: PICKUP }),
    );
    expect(r.code).toBe("INVALID_INPUT");
    const twenty = many.slice(0, 20);
    const ok = computePricing({
      items: twenty.map((p) => ({ sku: p.sku, qty: 1 })),
      products: mapOf(...twenty),
      settings: SETTINGS,
      delivery: PICKUP,
    });
    expect(ok.lines).toHaveLength(20);
  });

  it("SKU duplicados -> INVALID_INPUT (no se suman)", () => {
    const e = errorOf(() =>
      computePricing({
        items: [
          { sku: "A", qty: 1 },
          { sku: "A", qty: 2 },
        ],
        products,
        settings: SETTINGS,
        delivery: PICKUP,
      }),
    );
    expect(e.code).toBe("INVALID_INPUT");
    expect(JSON.stringify(e.details)).toContain("items.1.sku");
  });
});

describe("computePricing: disponibilidad y stock", () => {
  const run = (p: PricingProduct | undefined, qty = 1) =>
    errorOf(() =>
      computePricing({
        items: [{ sku: "A", qty }],
        products: p ? mapOf(p) : new Map(),
        settings: SETTINGS,
        delivery: PICKUP,
      }),
    );

  it("SKU inexistente -> PRODUCT_UNAVAILABLE con sku", () => {
    const e = run(undefined);
    expect(e.code).toBe("PRODUCT_UNAVAILABLE");
    expect(e.details).toEqual({ code: "PRODUCT_UNAVAILABLE", sku: "A" });
  });

  it("no publicado o inactivo -> PRODUCT_UNAVAILABLE", () => {
    expect(run(product("A", { published: false })).code).toBe("PRODUCT_UNAVAILABLE");
    expect(run(product("A", { active: false })).code).toBe("PRODUCT_UNAVAILABLE");
  });

  it("stock insuficiente -> OUT_OF_STOCK con available", () => {
    const e = run(product("A", { stock: 2 }), 3);
    expect(e.code).toBe("OUT_OF_STOCK");
    expect(e.details).toEqual({ code: "OUT_OF_STOCK", sku: "A", available: 2 });
  });

  it("stock exacto alcanza", () => {
    expect(run(product("A", { stock: 3 }), 3).code).toBeUndefined();
  });

  it("stock 0, negativo o inválido -> OUT_OF_STOCK con available 0", () => {
    for (const stock of [0, -4, Number.NaN]) {
      expect(run(product("A", { stock }), 1).details).toEqual({ code: "OUT_OF_STOCK", sku: "A", available: 0 });
    }
  });

  it("un producto no publicado se informa antes que el stock de otro posterior", () => {
    const e = errorOf(() =>
      computePricing({
        items: [
          { sku: "A", qty: 1 },
          { sku: "B", qty: 1 },
        ],
        products: mapOf(product("A", { published: false }), product("B", { stock: 0 })),
        settings: SETTINGS,
        delivery: PICKUP,
      }),
    );
    expect(e.code).toBe("PRODUCT_UNAVAILABLE");
  });
});

describe("computePricing: total", () => {
  it("total > 50.000.000 -> ORDER_TOO_LARGE", () => {
    const products = mapOf(product("A", { price: 10_000_000 }));
    const e = errorOf(() =>
      computePricing({
        items: [{ sku: "A", qty: 6 }],
        products,
        settings: { ...SETTINGS, maxQtyPerItem: 10 },
        delivery: PICKUP,
      }),
    );
    expect(e.code).toBe("ORDER_TOO_LARGE");
  });

  it("total exactamente 50.000.000 es válido", () => {
    const products = mapOf(product("A", { price: 10_000_000 }));
    const r = computePricing({ items: [{ sku: "A", qty: 5 }], products, settings: SETTINGS, delivery: PICKUP });
    expect(r.total).toBe(50_000_000);
  });

  it("con despacho, el envío cuenta para el tope", () => {
    const products = mapOf(product("A", { price: 10_000_000 }));
    const e = errorOf(() => computePricing({ items: [{ sku: "A", qty: 5 }], products, settings: SETTINGS, delivery: SHIP }));
    expect(e.code).toBe("ORDER_TOO_LARGE");
  });
});
