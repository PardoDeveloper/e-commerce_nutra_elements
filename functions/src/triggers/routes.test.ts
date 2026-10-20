import { describe, expect, it } from "vitest";
import { categoryRevalidation, deepEqual, productRevalidation, settingsRevalidation } from "./routes.js";

const base = {
  name: "Citrato de magnesio",
  slug: "citrato-de-magnesio",
  categoryId: "magnesio",
  price: 10000,
  finalPrice: 9000,
  inStock: true,
  stock: 10,
  reserved: 0,
  published: true,
  active: true,
  deletedAt: null,
  images: [{ path: "a.jpg", alt: "a" }],
};

describe("productRevalidation", () => {
  it("cambio de precio: ficha, categoría, listado, inicio y sitemap", () => {
    const plan = productRevalidation(base, { ...base, price: 12000, finalPrice: 11000 });
    expect(plan?.paths).toEqual(["/productos/citrato-de-magnesio", "/categorias/magnesio", "/productos", "/", "/sitemap.xml"]);
    expect(plan?.tags).toEqual(["catalog"]);
  });
  it("solo stock/reserved sin cambiar inStock: no revalida", () => {
    expect(productRevalidation(base, { ...base, stock: 5, reserved: 3 })).toBeNull();
  });
  it("cambia inStock: revalida", () => {
    expect(productRevalidation(base, { ...base, stock: 0, inStock: false })).not.toBeNull();
  });
  it("cambio de slug: incluye la ficha anterior y la nueva", () => {
    const plan = productRevalidation(base, { ...base, slug: "citrato-magnesio-120" });
    expect(plan?.paths).toContain("/productos/citrato-de-magnesio");
    expect(plan?.paths).toContain("/productos/citrato-magnesio-120");
  });
  it("cambio de categoría: incluye la anterior y la nueva", () => {
    const plan = productRevalidation(base, { ...base, categoryId: "minerales" });
    expect(plan?.paths).toContain("/categorias/magnesio");
    expect(plan?.paths).toContain("/categorias/minerales");
  });
  it("eliminación lógica: revalida la ficha anterior y no duplica rutas", () => {
    const plan = productRevalidation(base, { ...base, published: false, deletedAt: { seconds: 1 } });
    expect(plan?.paths).toEqual(["/productos/citrato-de-magnesio", "/categorias/magnesio", "/productos", "/", "/sitemap.xml"]);
  });
  it("eliminado que sigue eliminado: nada", () => {
    const deleted = { ...base, published: false, deletedAt: { seconds: 1 } };
    expect(productRevalidation(deleted, { ...deleted, name: "otro" })).toBeNull();
  });
  it("restaurar (sigue despublicado): nada", () => {
    const deleted = { ...base, published: false, deletedAt: { seconds: 1 } };
    expect(productRevalidation(deleted, { ...deleted, deletedAt: null })).toBeNull();
  });
  it("publicar: revalida la ficha nueva", () => {
    const draft = { ...base, published: false };
    expect(productRevalidation(draft, base)?.paths[0]).toBe("/productos/citrato-de-magnesio");
  });
  it("borrador editado: nada", () => {
    const draft = { ...base, published: false };
    expect(productRevalidation(draft, { ...draft, name: "x" })).toBeNull();
  });
  it("borrado físico de un producto publicado: revalida lo anterior", () => {
    expect(productRevalidation(base, undefined)?.paths[0]).toBe("/productos/citrato-de-magnesio");
  });
  it("creación publicada", () => {
    expect(productRevalidation(undefined, base)?.paths[0]).toBe("/productos/citrato-de-magnesio");
  });
  it("descarta slugs inválidos (no pasarían la lista blanca)", () => {
    const plan = productRevalidation(base, { ...base, slug: "../admin", categoryId: "A B" });
    expect(plan?.paths).not.toContain("/productos/../admin");
    expect(plan?.paths.every((p) => !p.includes(".."))).toBe(true);
  });
  it("cambio de imágenes (arreglo) se detecta", () => {
    expect(productRevalidation(base, { ...base, images: [{ path: "b.jpg", alt: "b" }] })).not.toBeNull();
  });
});

describe("categoryRevalidation", () => {
  const cat = { name: "Magnesio", published: true, order: 1 };
  it("cambio visible", () => {
    const plan = categoryRevalidation("magnesio", cat, { ...cat, name: "Magnesios" });
    expect(plan?.paths).toEqual(["/categorias/magnesio", "/productos", "/", "/sitemap.xml"]);
  });
  it("sin cambio visible o no publicada: nada", () => {
    expect(categoryRevalidation("magnesio", cat, { ...cat, updatedAt: 2 })).toBeNull();
    expect(categoryRevalidation("magnesio", { ...cat, published: false }, { ...cat, published: false, name: "x" })).toBeNull();
  });
  it("despublicar revalida", () => {
    expect(categoryRevalidation("magnesio", cat, { ...cat, published: false })).not.toBeNull();
  });
});

describe("settingsRevalidation", () => {
  const s = { shippingFee: 3990, freeShippingThreshold: null, pickup: { enabled: true, address: "a", hours: "h" } };
  it("cambio del umbral", () => {
    const plan = settingsRevalidation(s, { ...s, freeShippingThreshold: 40000 });
    expect(plan).toEqual({ paths: ["/", "/productos", "/preguntas-frecuentes", "/contacto"], tags: ["settings"] });
  });
  it("sin cambio visible: nada", () => {
    expect(settingsRevalidation(s, { ...s, updatedAt: 5 })).toBeNull();
  });
});

describe("deepEqual", () => {
  it("compara mapas sin importar el orden de claves", () => {
    expect(deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });
});
