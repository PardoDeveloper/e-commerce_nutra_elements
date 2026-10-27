import { describe, expect, it } from "vitest";
import { cleanCategoryName, newCategorySlug, nextCategoryOrder, sortCategories } from "./categories";
import { createDemoService, publishBlocker } from "./demo-service";
import { AdminServiceError } from "./errors";
import { mapAdminCategory } from "./firebase-mappers";
import { defaultSettings } from "./seed";
import { makeProduct } from "./testing";

const cat = (slug: string, name: string, order: number) => ({ slug, name, order, published: true });

function setup() {
  const settings = defaultSettings({
    shippingFee: 3990,
    freeShippingThreshold: null,
    pickup: { enabled: true, address: "Calle 1", hours: "9 a 20" },
    maxQtyPerItem: 10,
  });
  return createDemoService({
    products: [makeProduct({ categoryId: "vitaminas" }), makeProduct({ sku: "2002", slug: "otro", name: "Otro", categoryId: "magnesio" })],
    orders: [],
    settings,
    categories: [cat("vitaminas", "Vitaminas", 10), cat("magnesio", "Magnesio", 20)],
  });
}

describe("reglas de categorías", () => {
  it("limpia el nombre y exige de 1 a 80 caracteres", () => {
    expect(cleanCategoryName("  Proteínas   y  más ")).toBe("Proteínas y más");
    expect(() => cleanCategoryName("   ")).toThrow(AdminServiceError);
    expect(() => cleanCategoryName("x".repeat(81))).toThrow(AdminServiceError);
  });

  it("genera el slug del nombre y rechaza uno repetido o vacío", () => {
    expect(newCategorySlug("Proteínas y Más", [])).toBe("proteinas-y-mas");
    expect(() => newCategorySlug("¡¡!!", [])).toThrow(AdminServiceError);
    expect(() => newCategorySlug("VITAMINAS", [cat("vitaminas", "Vitaminas", 10)])).toThrow(/Ya existe/);
  });

  it("ordena al final y por nombre a igual orden", () => {
    expect(nextCategoryOrder([])).toBe(10);
    expect(nextCategoryOrder([cat("a", "A", 60), cat("b", "B", 20)])).toBe(70);
    expect(sortCategories([cat("b", "Beta", 10), cat("a", "Alfa", 10), cat("c", "Cero", 5)]).map((c) => c.slug)).toEqual(["c", "a", "b"]);
  });

  it("mapea el documento de Firestore (con o sin publicar) y descarta uno sin nombre", () => {
    expect(mapAdminCategory("proteinas", { name: "Proteínas", order: 70, published: false })).toEqual({ slug: "proteinas", name: "Proteínas", order: 70, published: false });
    expect(mapAdminCategory("x", { order: 1 })).toBeNull();
  });
});

describe("categorías en el servicio simulado", () => {
  it("crea, renombra y elimina; al eliminar deja sin categoría a sus productos", async () => {
    const svc = setup();
    const { slug } = await svc.createCategory({ name: "Proteínas" });
    expect(slug).toBe("proteinas");
    expect(svc.getState().categories.map((c) => c.slug)).toEqual(["vitaminas", "magnesio", "proteinas"]);
    await expect(svc.createCategory({ name: "proteinas" })).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });

    // Renombrar cambia el slug (la URL siempre es el nombre) y mueve sus productos.
    expect(await svc.updateCategory("magnesio", { name: "Magnesio y más" })).toEqual({ slug: "magnesio-y-mas" });
    expect(svc.getState().categories.some((c) => c.slug === "magnesio")).toBe(false);
    expect(svc.getState().categories.find((c) => c.slug === "magnesio-y-mas")?.name).toBe("Magnesio y más");
    expect(svc.getState().products.find((p) => p.sku === "2002")?.categoryId).toBe("magnesio-y-mas");
    // Solo mayúsculas: mismo slug.
    expect(await svc.updateCategory("magnesio-y-mas", { name: "MAGNESIO Y MÁS" })).toEqual({ slug: "magnesio-y-mas" });
    await expect(svc.updateCategory("magnesio-y-mas", { name: "Proteínas" })).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });

    const result = await svc.deleteCategory("vitaminas");
    expect(result.productsUpdated).toBe(1);
    expect(svc.getState().categories.some((c) => c.slug === "vitaminas")).toBe(false);
    expect(svc.getState().products.find((p) => p.sku === "1001")?.categoryId).toBeNull();
    await expect(svc.deleteCategory("vitaminas")).rejects.toMatchObject({ code: "CATEGORY_NOT_FOUND" });
  });

  it("no asigna a un producto una categoría que no existe, pero sí ninguna", async () => {
    const svc = setup();
    await expect(svc.updateProductContent("1001", { categoryId: "no-existe" })).rejects.toMatchObject({ code: "INVALID_CATEGORY" });
    await svc.updateProductContent("1001", { categoryId: null });
    expect(svc.getState().products.find((p) => p.sku === "1001")?.categoryId).toBeNull();
  });

  it("publica un producto sin categoría (D-040)", () => {
    const p = makeProduct({ categoryId: null, published: false });
    expect(publishBlocker(p, [p], new Set())).toBeNull();
  });
});
