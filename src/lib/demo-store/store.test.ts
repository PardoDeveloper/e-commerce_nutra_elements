import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getBaseCatalog } from "@/lib/data";
import { mockDataLayer as data } from "@/lib/data/mock";
import { readImage, readStoreSync, resetStore, resolveImageFile, saveImage, saveProducts, DemoStoreError } from "./store";
import type { StoredProductInput } from "./types";

const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

let dir = "";
const saved = { p: process.env.DEMO_PERSISTENCE, d: process.env.DEMO_DATA_DIR, k: process.env.K_SERVICE };

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "demo-store-"));
  process.env.DEMO_PERSISTENCE = "true";
  process.env.DEMO_DATA_DIR = dir;
  delete process.env.K_SERVICE;
});

afterEach(async () => {
  for (const [key, value] of [["DEMO_PERSISTENCE", saved.p], ["DEMO_DATA_DIR", saved.d], ["K_SERVICE", saved.k]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(dir, { recursive: true, force: true });
});

const base = () => getBaseCatalog().map((p) => ({ sku: p.sku, slug: p.slug, categoryId: p.categoryId }));

/** Producto base como registro guardable, con cambios encima. */
function input(sku: string, over: Partial<StoredProductInput> = {}): StoredProductInput {
  const p = getBaseCatalog().find((x) => x.sku === sku)!;
  return {
    sku,
    name: p.name,
    slug: p.slug,
    description: null,
    shortDescription: null,
    categoryId: p.categoryId,
    images: [],
    price: p.price,
    discount: null,
    stock: 10,
    active: true,
    published: true,
    format: p.format,
    unitsPerPack: p.unitsPerPack,
    seo: null,
    deletedAt: null,
    deletedBy: null,
    ...over,
  };
}

describe("ruta de imágenes: sin path traversal", () => {
  it("resuelve nombres válidos dentro de images/", () => {
    const full = resolveImageFile("1001", "0123456789abcdef.webp");
    expect(full).toBe(path.join(dir, "images", "1001", "0123456789abcdef.webp"));
  });

  it("rechaza .., %2e%2e, barras (normales e invertidas) y SKU inválidos", () => {
    const files = ["../products.json", "..\\products.json", "%2e%2e", "%2e%2e%2fproducts.json", "..%5cproducts.json", "a/b.webp", "a\\b.webp", "0123456789abcdef.webp/", "0123456789abcdef.svg", "0123456789ABCDEF.webp", "0123456789abcdef.webp\0", ""];
    for (const file of files) expect(resolveImageFile("1001", file), file).toBeNull();
    const skus = ["..", ".", "../images", "..\\x", "%2e%2e", "a/b", "a\\b", "", "x".repeat(33), "con espacio", "C:", "1001/.."];
    for (const sku of skus) expect(resolveImageFile(sku, "0123456789abcdef.webp"), sku).toBeNull();
  });

  it("readImage no lee nada fuera de images/ ni con la persistencia desactivada", async () => {
    await writeFile(path.join(dir, "secreto.txt"), "no");
    expect(await readImage("..", "secreto.txt")).toBeNull();
    expect(await readImage("1001", "../../secreto.txt")).toBeNull();
    const sku = getBaseCatalog()[0]!.sku;
    const { path: stored } = await saveImage(base(), sku, "image/webp", WEBP);
    const file = stored.split("/").pop()!;
    expect(await readImage(sku, file)).toMatchObject({ mime: "image/webp" });
    process.env.DEMO_PERSISTENCE = "false";
    expect(await readImage(sku, file)).toBeNull();
    process.env.DEMO_PERSISTENCE = "true";
    process.env.K_SERVICE = "nutra";
    expect(await readImage(sku, file)).toBeNull();
  });
});

describe("subida de imágenes", () => {
  it("guarda con nombre generado por el servidor y devuelve ruta tipo Storage", async () => {
    const sku = getBaseCatalog()[0]!.sku;
    const result = await saveImage(base(), sku, "image/webp", WEBP);
    expect(result.path).toMatch(new RegExp(`^products/${sku}/[a-f0-9]{16}\\.webp$`));
    expect(result.url).toBe(`/api/demo-images/${sku}/${result.path.split("/")[2]}`);
    expect(await readdir(path.join(dir, "images", sku))).toHaveLength(1);
  });

  it("rechaza SKU inexistente, tipo falso y tamaño excesivo sin escribir nada", async () => {
    await expect(saveImage(base(), "NO-EXISTE", "image/webp", WEBP)).rejects.toMatchObject({ code: "SKU_NOT_FOUND" });
    const sku = getBaseCatalog()[0]!.sku;
    await expect(saveImage(base(), sku, "image/webp", new TextEncoder().encode("<html>"))).rejects.toMatchObject({ code: "INVALID_IMAGE_CONTENT" });
    await expect(saveImage(base(), sku, "image/webp", new Uint8Array(2 * 1024 * 1024 + 1))).rejects.toBeInstanceOf(DemoStoreError);
    await expect(readdir(path.join(dir, "images"))).rejects.toThrow();
  });

  it("responde 404 con la persistencia desactivada", async () => {
    delete process.env.DEMO_PERSISTENCE;
    const sku = getBaseCatalog()[0]!.sku;
    await expect(saveImage(base(), sku, "image/webp", WEBP)).rejects.toMatchObject({ status: 404 });
    await expect(saveProducts(base(), [input(sku)])).rejects.toMatchObject({ status: 404 });
  });
});

describe("guardado de productos", () => {
  it("escribe el archivo y no deja temporales", async () => {
    const sku = getBaseCatalog()[0]!.sku;
    await saveProducts(base(), [input(sku, { price: 4321 })]);
    const file = JSON.parse(await readFile(path.join(dir, "products.json"), "utf8")) as { version: number; products: Record<string, { price: number }> };
    expect(file.version).toBe(1);
    expect(file.products[sku]?.price).toBe(4321);
    expect((await readdir(dir)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("rechaza SKU inexistente, repetidos, campos inválidos e imágenes que no existen", async () => {
    const sku = getBaseCatalog()[0]!.sku;
    await expect(saveProducts(base(), [{ ...input(sku), sku: "NO-EXISTE" }])).rejects.toMatchObject({ status: 400 });
    await expect(saveProducts(base(), [input(sku), input(sku)])).rejects.toMatchObject({ status: 400 });
    await expect(saveProducts(base(), [input(sku, { price: 0 })])).rejects.toMatchObject({ status: 400 });
    await expect(saveProducts(base(), [])).rejects.toMatchObject({ status: 400 });
    await expect(saveProducts(base(), [input(sku, { images: [{ path: `products/${sku}/0123456789abcdef.webp`, alt: "x" }] })])).rejects.toMatchObject({ code: "IMAGE_NOT_FOUND" });
    await expect(readFile(path.join(dir, "products.json"))).rejects.toThrow();
  });

  it("rechaza un slug usado por otro producto visible", async () => {
    const [a, b] = getBaseCatalog();
    await expect(saveProducts(base(), [input(a!.sku, { slug: b!.slug })])).rejects.toMatchObject({ status: 409, code: "DUPLICATE_SLUG" });
  });

  it("restablecer borra cambios e imágenes", async () => {
    const sku = getBaseCatalog()[0]!.sku;
    await saveImage(base(), sku, "image/webp", WEBP);
    await saveProducts(base(), [input(sku, { price: 999 })]);
    await resetStore();
    expect(Object.keys(readStoreSync().data.products)).toEqual([]);
    await expect(readdir(path.join(dir, "images"))).rejects.toThrow();
  });

  it("un archivo dañado no rompe la lectura", async () => {
    await writeFile(path.join(dir, "products.json"), "{ no es json");
    expect(readStoreSync().data.products).toEqual({});
    expect(await data.getProducts()).toHaveLength(getBaseCatalog().length);
  });
});

describe("@/lib/data mezcla los cambios guardados con el catálogo base", () => {
  it("sin persistencia devuelve el catálogo base aunque exista el archivo", async () => {
    const sku = getBaseCatalog()[0]!.sku;
    await saveProducts(base(), [input(sku, { price: 777 })]);
    delete process.env.DEMO_PERSISTENCE;
    const all = await data.getProducts();
    expect(all).toHaveLength(getBaseCatalog().length);
    expect(all.find((p) => p.sku === sku)?.price).toBe(getBaseCatalog()[0]!.price);
  });

  it("aplica precio, descuento, stock e imágenes", async () => {
    const target = getBaseCatalog()[0]!;
    const img = await saveImage(base(), target.sku, "image/webp", WEBP);
    await saveProducts(base(), [
      input(target.sku, { price: 20000, discount: { type: "percent", value: 10 }, stock: 0, images: [{ path: img.path, alt: "Frasco de prueba" }] }),
    ]);
    const product = await data.getProduct(target.slug);
    expect(product).toMatchObject({ price: 20000, finalPrice: 18000, inStock: false });
    expect(product?.images).toEqual([{ path: img.path, alt: "Frasco de prueba", url: `/api/demo-images/${target.sku}/${img.path.split("/")[2]}` }]);
  });

  it("un producto eliminado no aparece y su ficha da null (404)", async () => {
    const target = getBaseCatalog()[0]!;
    await saveProducts(base(), [input(target.sku, { published: false, deletedAt: "2026-10-19T12:00:00.000Z", deletedBy: "demo-admin" })]);
    expect(await data.getProduct(target.slug)).toBeNull();
    expect((await data.getProducts()).some((p) => p.sku === target.sku)).toBe(false);
    expect((await data.getRelatedProducts(getBaseCatalog()[1]!.sku, 50)).some((p) => p.sku === target.sku)).toBe(false);
  });

  it("un producto despublicado o inactivo no aparece; al restaurar y publicar vuelve", async () => {
    const target = getBaseCatalog()[0]!;
    await saveProducts(base(), [input(target.sku, { published: false })]);
    expect(await data.getProduct(target.slug)).toBeNull();
    await saveProducts(base(), [input(target.sku, { active: false, published: false })]);
    expect(await data.getProduct(target.slug)).toBeNull();
    await saveProducts(base(), [input(target.sku, { published: true })]);
    expect((await data.getProduct(target.slug))?.sku).toBe(target.sku);
  });

  it("un cambio de slug mueve la ficha", async () => {
    const target = getBaseCatalog()[0]!;
    await saveProducts(base(), [input(target.sku, { slug: "slug-nuevo-de-prueba" })]);
    expect(await data.getProduct(target.slug)).toBeNull();
    expect((await data.getProduct("slug-nuevo-de-prueba"))?.sku).toBe(target.sku);
  });

  it("restablecer devuelve el catálogo original", async () => {
    const target = getBaseCatalog()[0]!;
    await saveProducts(base(), [input(target.sku, { price: 555, published: false })]);
    await resetStore();
    expect((await data.getProduct(target.slug))?.price).toBe(target.price);
  });
});
