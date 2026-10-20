import { describe, expect, it } from "vitest";
import { checkImageUpload, detectImageKind, validateProductInput } from "./validate";

const webp = () => Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const jpg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

describe("imágenes: bytes mágicos, tipo y tamaño", () => {
  it("detecta WebP, JPEG y PNG por su contenido", () => {
    expect(detectImageKind(webp())).toBe("webp");
    expect(detectImageKind(jpg())).toBe("jpg");
    expect(detectImageKind(png())).toBe("png");
    expect(detectImageKind(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull(); // GIF
    expect(detectImageKind(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it("acepta cuando el tipo declarado y los bytes coinciden", () => {
    expect(checkImageUpload("image/webp", webp())).toEqual({ ok: true, kind: "webp" });
    expect(checkImageUpload("image/jpeg", jpg())).toEqual({ ok: true, kind: "jpg" });
    expect(checkImageUpload("image/png", png())).toEqual({ ok: true, kind: "png" });
  });

  it("rechaza tipos no permitidos, aunque los bytes sean de imagen", () => {
    for (const type of ["image/gif", "image/svg+xml", "text/html", "application/octet-stream", ""]) {
      expect(checkImageUpload(type, webp()).ok, type).toBe(false);
    }
  });

  it("rechaza contenido que no es una imagen aunque se declare como tal", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(checkImageUpload("image/png", html)).toMatchObject({ ok: false, code: "INVALID_IMAGE_CONTENT" });
  });

  it("rechaza un tipo declarado que no coincide con los bytes", () => {
    expect(checkImageUpload("image/png", jpg())).toMatchObject({ ok: false, code: "INVALID_IMAGE_CONTENT" });
  });

  it("rechaza archivos vacíos y de más de 2 MiB", () => {
    expect(checkImageUpload("image/webp", new Uint8Array())).toMatchObject({ ok: false, code: "EMPTY_IMAGE" });
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(webp());
    expect(checkImageUpload("image/webp", big)).toMatchObject({ ok: false, code: "IMAGE_TOO_LARGE" });
    const exact = new Uint8Array(2 * 1024 * 1024);
    exact.set(webp());
    expect(checkImageUpload("image/webp", exact).ok).toBe(true);
  });
});

const valid = () => ({
  sku: "1001",
  name: "Citrato de Magnesio",
  slug: "citrato-de-magnesio",
  description: null,
  shortDescription: null,
  categoryId: "magnesio",
  images: [{ path: "products/1001/0123456789abcdef.webp", alt: "Frasco" }],
  price: 12990,
  discount: null,
  stock: 5,
  active: true,
  published: true,
  format: null,
  unitsPerPack: 120,
  family: null,
  seo: null,
  deletedAt: null,
  deletedBy: null,
});

describe("validación de productos", () => {
  it("acepta un producto válido", () => {
    expect(validateProductInput(valid()).ok).toBe(true);
  });

  it("rechaza no objetos y campos desconocidos", () => {
    expect(validateProductInput(null).ok).toBe(false);
    expect(validateProductInput([]).ok).toBe(false);
    expect(validateProductInput({ ...valid(), isAdmin: true }).ok).toBe(false);
  });

  it("valida el precio: entero de 1 a 10.000.000", () => {
    for (const price of [0, -1, 1.5, 10_000_001, "100", null, Number.NaN]) {
      expect(validateProductInput({ ...valid(), price }).ok, String(price)).toBe(false);
    }
    expect(validateProductInput({ ...valid(), price: 1 }).ok).toBe(true);
    expect(validateProductInput({ ...valid(), price: 10_000_000 }).ok).toBe(true);
  });

  it("valida el stock: entero de 0 a 1.000.000", () => {
    for (const stock of [-1, 0.5, 1_000_001, "3"]) expect(validateProductInput({ ...valid(), stock }).ok, String(stock)).toBe(false);
    expect(validateProductInput({ ...valid(), stock: 0 }).ok).toBe(true);
    expect(validateProductInput({ ...valid(), stock: 1_000_000 }).ok).toBe(true);
  });

  it("valida SKU, slug y categoría", () => {
    expect(validateProductInput({ ...valid(), sku: "../x" }).ok).toBe(false);
    expect(validateProductInput({ ...valid(), sku: "a".repeat(33) }).ok).toBe(false);
    expect(validateProductInput({ ...valid(), slug: "Con Mayúsculas" }).ok).toBe(false);
    expect(validateProductInput({ ...valid(), categoryId: "otra" }).ok).toBe(false);
  });

  it("valida el descuento contra el precio", () => {
    expect(validateProductInput({ ...valid(), discount: { type: "percent", value: 20 } }).ok).toBe(true);
    expect(validateProductInput({ ...valid(), discount: { type: "percent", value: 100 } }).ok).toBe(false);
    expect(validateProductInput({ ...valid(), discount: { type: "fixed", value: 12990 } }).ok).toBe(false);
    expect(validateProductInput({ ...valid(), discount: { type: "fixed", value: 1000, extra: 1 } }).ok).toBe(false);
  });

  it("las imágenes deben ser rutas del mismo SKU generadas por el servidor", () => {
    const bad = ["products/9999/0123456789abcdef.webp", "products/1001/../x.webp", "products/1001/nombre-del-cliente.webp", "https://x.test/a.webp", "products/1001/0123456789abcdef.gif"];
    for (const path of bad) expect(validateProductInput({ ...valid(), images: [{ path, alt: "x" }] }).ok, path).toBe(false);
    const nine = Array.from({ length: 9 }, (_, i) => ({ path: `products/1001/${String(i).repeat(16)}.webp`, alt: "x" }));
    expect(validateProductInput({ ...valid(), images: nine }).ok).toBe(false);
  });

  it("exige coherencia: eliminado no puede estar publicado; publicado requiere activo, slug y categoría", () => {
    const deleted = { deletedAt: "2026-10-19T10:00:00.000Z", deletedBy: "demo-admin" };
    expect(validateProductInput({ ...valid(), ...deleted }).ok).toBe(false);
    expect(validateProductInput({ ...valid(), ...deleted, published: false }).ok).toBe(true);
    expect(validateProductInput({ ...valid(), active: false }).ok).toBe(false);
    expect(validateProductInput({ ...valid(), slug: null }).ok).toBe(false);
  });
});
