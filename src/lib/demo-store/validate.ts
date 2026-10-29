// Validación estricta de lo que llega al servidor (D-030). Funciones puras, con tests.
import { validateDiscount } from "@/lib/admin/pricing";
import { IMAGE_PATH_RE, MAX_IMAGE_BYTES, SKU_RE } from "./config";
import type { StoredProductInput } from "./types";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------- Imágenes ----------
export type ImageKind = "webp" | "jpg" | "png";
const KIND_BY_MIME: Record<string, ImageKind> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

/** Detecta el formato por los bytes mágicos (no por lo que declare el cliente). */
export function detectImageKind(b: Uint8Array): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "png";
  // WebP: "RIFF" + tamaño (4 bytes) + "WEBP".
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "webp";
  }
  return null;
}

export type ImageCheck = { ok: true; kind: ImageKind } | { ok: false; code: string; message: string };

/** Tipo declarado permitido, tamaño de 1 byte a 2 MiB y bytes mágicos coherentes con el tipo. */
export function checkImageUpload(declaredType: string, bytes: Uint8Array): ImageCheck {
  const declared = KIND_BY_MIME[declaredType];
  if (!declared) return { ok: false, code: "INVALID_IMAGE_TYPE", message: "Solo se admiten imágenes WebP, JPEG o PNG." };
  if (bytes.length === 0) return { ok: false, code: "EMPTY_IMAGE", message: "El archivo está vacío." };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, code: "IMAGE_TOO_LARGE", message: "La imagen supera los 2 MiB." };
  const real = detectImageKind(bytes);
  if (real === null || real !== declared) {
    return { ok: false, code: "INVALID_IMAGE_CONTENT", message: "El contenido del archivo no coincide con una imagen WebP, JPEG o PNG." };
  }
  return { ok: true, kind: real };
}

// ---------- Productos ----------
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown, min: number, max: number): v is string => typeof v === "string" && v.length >= min && v.length <= max;

// `family` ya no existe (D-040), pero se acepta y se ignora para no rechazar lo guardado antes.
const FIELDS = [
  "sku", "name", "slug", "description", "shortDescription", "categoryId", "images", "price", "discount", "stock",
  "active", "published", "format", "unitsPerPack", "featured", "family", "seo", "deletedAt", "deletedBy",
  "commissionPerUnit",
] as const;

/** Valida un producto del cuerpo de la petición. Rechaza campos desconocidos y tipos incorrectos. */
export function validateProductInput(raw: unknown): ValidationResult<StoredProductInput> {
  if (!isRecord(raw)) return { ok: false, errors: ["El producto debe ser un objeto."] };
  const errors: string[] = [];
  const sku = raw.sku;
  const label = typeof sku === "string" && SKU_RE.test(sku) ? sku : "?";
  const bad = (field: string, why: string) => errors.push(`${label}: ${field} ${why}`);

  for (const key of Object.keys(raw)) if (!(FIELDS as readonly string[]).includes(key)) bad(key, "no es un campo permitido.");
  if (typeof sku !== "string" || !SKU_RE.test(sku)) bad("sku", "no es válido.");
  if (!isStr(raw.name, 1, 120) || raw.name.trim() === "") bad("name", "debe tener entre 1 y 120 caracteres.");
  if (!(raw.slug === null || (isStr(raw.slug, 1, 80) && SLUG_RE.test(raw.slug)))) bad("slug", "solo admite minúsculas, números y guiones.");
  if (!(raw.description === null || isStr(raw.description, 0, 5000))) bad("description", "admite hasta 5000 caracteres.");
  if (!(raw.shortDescription === null || isStr(raw.shortDescription, 0, 300))) bad("shortDescription", "admite hasta 300 caracteres.");
  if (!(raw.categoryId === null || (isStr(raw.categoryId, 1, 60) && SLUG_RE.test(raw.categoryId)))) bad("categoryId", "no es una categoría válida.");
  if (!isInt(raw.price, 1, 10_000_000)) bad("price", "debe ser un entero entre 1 y 10.000.000.");
  if (!isInt(raw.stock, 0, 1_000_000)) bad("stock", "debe ser un entero entre 0 y 1.000.000.");
  if (typeof raw.active !== "boolean") bad("active", "debe ser booleano.");
  if (typeof raw.published !== "boolean") bad("published", "debe ser booleano.");
  if (!(raw.format === null || isStr(raw.format, 0, 60))) bad("format", "admite hasta 60 caracteres.");
  if (!(raw.unitsPerPack === null || isInt(raw.unitsPerPack, 1, 10_000))) bad("unitsPerPack", "debe ser un entero entre 1 y 10.000.");
  if (!(raw.featured === undefined || typeof raw.featured === "boolean")) bad("featured", "debe ser booleano.");
  if (!(raw.deletedBy === null || isStr(raw.deletedBy, 1, 64))) bad("deletedBy", "no es válido.");
  if (!(raw.commissionPerUnit === undefined || raw.commissionPerUnit === null || isInt(raw.commissionPerUnit, 0, 10_000_000))) bad("commissionPerUnit", "debe ser un entero entre 0 y 10.000.000.");
  if (!(raw.deletedAt === null || (isStr(raw.deletedAt, 10, 40) && !Number.isNaN(Date.parse(raw.deletedAt))))) bad("deletedAt", "debe ser una fecha ISO.");

  let discount: StoredProductInput["discount"] = null;
  if (raw.discount !== null) {
    const d = raw.discount;
    if (!isRecord(d) || Object.keys(d).some((k) => k !== "type" && k !== "value") || (d.type !== "percent" && d.type !== "fixed") || typeof d.value !== "number") {
      bad("discount", "no es válido.");
    } else if (typeof raw.price === "number" && validateDiscount(raw.price, { type: d.type, value: d.value }) !== null) {
      bad("discount", "no es válido para ese precio.");
    } else {
      discount = { type: d.type, value: d.value };
    }
  }

  let seo: StoredProductInput["seo"] = null;
  if (raw.seo !== null) {
    const s = raw.seo;
    if (!isRecord(s) || Object.keys(s).some((k) => k !== "title" && k !== "description")) bad("seo", "no es válido.");
    else if ((s.title !== undefined && !isStr(s.title, 0, 70)) || (s.description !== undefined && !isStr(s.description, 0, 170))) bad("seo", "excede los largos permitidos.");
    else seo = { ...(s.title !== undefined ? { title: s.title as string } : {}), ...(s.description !== undefined ? { description: s.description as string } : {}) };
  }

  const images: StoredProductInput["images"] = [];
  if (!Array.isArray(raw.images) || raw.images.length > 8) bad("images", "debe ser una lista de hasta 8 imágenes.");
  else {
    for (const img of raw.images as unknown[]) {
      if (!isRecord(img) || Object.keys(img).some((k) => k !== "path" && k !== "alt") || typeof img.path !== "string" || !isStr(img.alt, 0, 140)) {
        bad("images", "tiene un elemento inválido.");
        continue;
      }
      const m = IMAGE_PATH_RE.exec(img.path);
      if (!m || m[1] !== sku) bad("images", "tiene una ruta que no corresponde a este SKU.");
      else images.push({ path: img.path, alt: img.alt });
    }
    if (new Set(images.map((i) => i.path)).size !== images.length) bad("images", "tiene rutas repetidas.");
  }

  // Coherencia (D-029 y reglas de publicación): eliminado => despublicado; publicado => activo y con slug (la categoría es opcional).
  if (raw.deletedAt !== null && raw.published === true) bad("published", "no puede ser verdadero en un producto eliminado.");
  if (raw.published === true && raw.active !== true) bad("published", "requiere que el producto esté activo.");
  if (raw.published === true && raw.slug === null) bad("published", "requiere slug.");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      sku: sku as string,
      name: (raw.name as string).trim(),
      slug: raw.slug as string | null,
      description: raw.description as string | null,
      shortDescription: raw.shortDescription as string | null,
      categoryId: raw.categoryId as string | null,
      images,
      price: raw.price as number,
      discount,
      stock: raw.stock as number,
      active: raw.active as boolean,
      published: raw.published as boolean,
      format: raw.format as string | null,
      unitsPerPack: raw.unitsPerPack as number | null,
      seo,
      deletedAt: raw.deletedAt as string | null,
      deletedBy: raw.deletedBy as string | null,
      ...(raw.featured !== undefined ? { featured: raw.featured as boolean } : {}),
      ...(raw.commissionPerUnit !== undefined ? { commissionPerUnit: raw.commissionPerUnit as number | null } : {}),
    },
  };
}
