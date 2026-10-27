import "server-only";
// Almacén en disco de la demo (D-030). SOLO servidor y SOLO local: cada función comprueba
// `isPersistenceEnabled()`. Se reemplaza por Firestore (productos) y Storage (imágenes).
//
//   .demo-data/products.json            cambios por SKU sobre el catálogo base
//   .demo-data/images/<sku>/<id>.<ext>  imágenes; el nombre lo genera el servidor
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  IMAGE_FILE_RE,
  IMAGE_MIME_BY_EXT,
  IMAGE_PATH_RE,
  isPersistenceEnabled,
  MAX_IMAGE_FILES_PER_SKU,
  MAX_PRODUCTS_PER_REQUEST,
  SKU_RE,
} from "./config";
import { isVisible } from "./merge";
import type { StoreFile, StoredProduct, StoredProductInput } from "./types";
import { checkImageUpload, validateProductInput } from "./validate";

/** Datos mínimos del catálogo base que el almacén necesita para validar. */
export interface BaseRef {
  sku: string;
  slug: string;
  categoryId: string | null;
}

export class DemoStoreError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = "DemoStoreError";
  }
}

/** Carpeta de datos. `DEMO_DATA_DIR` existe solo para las pruebas automáticas. */
export function dataDir(): string {
  return process.env.DEMO_DATA_DIR ? path.resolve(process.env.DEMO_DATA_DIR) : path.join(process.cwd(), ".demo-data");
}
const productsFile = () => path.join(dataDir(), "products.json");
const imagesDir = () => path.join(dataDir(), "images");

const EMPTY: StoreFile = { version: 1, products: {} };

// ---------- Lectura (síncrona y con caché por mtime: la usa la capa de datos en cada render) ----------
let cached: { key: string; data: StoreFile } | null = null;

/** Lo guardado y una clave de versión (cambia cuando el archivo cambia). Sin persistencia: vacío. */
export function readStoreSync(): { key: string; data: StoreFile } {
  if (!isPersistenceEnabled()) return { key: "off", data: EMPTY };
  const file = productsFile();
  let key = "none";
  try {
    const s = statSync(file);
    key = `${file}:${s.mtimeMs}:${s.size}`;
  } catch {
    cached = null;
    return { key: "none", data: EMPTY };
  }
  if (cached?.key === key) return cached;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<StoreFile>;
    const data: StoreFile = parsed.version === 1 && parsed.products && typeof parsed.products === "object" ? { version: 1, products: parsed.products } : EMPTY;
    cached = { key, data };
  } catch {
    // Archivo dañado: se ignora (la tienda vuelve al catálogo base) en lugar de romper todas las páginas.
    cached = { key, data: EMPTY };
  }
  return cached;
}

// ---------- Escritura (serializada y atómica) ----------
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, content, "utf8");
  // En Windows el rename puede fallar un instante si otro proceso tiene el archivo abierto.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (error) {
      if (attempt >= 5) {
        await unlink(tmp).catch(() => undefined);
        throw error;
      }
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
    }
  }
}

function requireEnabled(): void {
  if (!isPersistenceEnabled()) throw new DemoStoreError(404, "NOT_FOUND", "No encontrado.");
}

export interface SaveResult {
  saved: number;
  /** Slugs y categorías (antes y después) para revalidar. */
  slugs: string[];
  categories: string[];
}

/** Ruta absoluta de una imagen si el SKU y el nombre son válidos y queda dentro de `images/`; si no, null. */
export function resolveImageFile(sku: string, file: string): string | null {
  if (!SKU_RE.test(sku) || !IMAGE_FILE_RE.test(file)) return null;
  const root = path.resolve(imagesDir());
  const full = path.resolve(root, sku, file);
  return full.startsWith(root + path.sep) ? full : null;
}

export function imageMimeOf(file: string): string | null {
  return IMAGE_MIME_BY_EXT[file.slice(file.lastIndexOf(".") + 1)] ?? null;
}

export async function readImage(sku: string, file: string): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!isPersistenceEnabled()) return null;
  const full = resolveImageFile(sku, file);
  const mime = imageMimeOf(file);
  if (!full || !mime) return null;
  try {
    return { bytes: await readFile(full), mime };
  } catch {
    return null;
  }
}

/** Guarda los productos validados. `base` es el catálogo base (los SKU deben existir en él). */
export function saveProducts(base: readonly BaseRef[], rawProducts: unknown): Promise<SaveResult> {
  return serialize(async () => {
    requireEnabled();
    if (!Array.isArray(rawProducts) || rawProducts.length === 0) throw new DemoStoreError(400, "INVALID_INPUT", "Envía al menos un producto.");
    if (rawProducts.length > MAX_PRODUCTS_PER_REQUEST) throw new DemoStoreError(400, "TOO_MANY_ROWS", `Máximo ${MAX_PRODUCTS_PER_REQUEST} productos por petición.`);

    const baseMap = new Map(base.map((b) => [b.sku, b] as const));
    const errors: string[] = [];
    const inputs: StoredProductInput[] = [];
    const seen = new Set<string>();
    for (const raw of rawProducts as unknown[]) {
      const result = validateProductInput(raw);
      if (!result.ok) {
        errors.push(...result.errors);
        continue;
      }
      const input = result.value;
      if (!baseMap.has(input.sku)) errors.push(`${input.sku}: el SKU no existe en el catálogo.`);
      else if (seen.has(input.sku)) errors.push(`${input.sku}: SKU repetido en la petición.`);
      else {
        seen.add(input.sku);
        inputs.push(input);
      }
    }
    if (errors.length > 0) throw new DemoStoreError(400, "INVALID_INPUT", "Hay datos inválidos.", errors.slice(0, 20));

    // Las imágenes referenciadas deben existir en disco (las subió este mismo servidor).
    for (const input of inputs) {
      for (const img of input.images) {
        const m = IMAGE_PATH_RE.exec(img.path);
        const full = m ? resolveImageFile(m[1]!, m[2]!) : null;
        const exists = full ? await stat(full).then((s) => s.isFile(), () => false) : false;
        if (!exists) throw new DemoStoreError(400, "IMAGE_NOT_FOUND", `${input.sku}: la imagen ${img.path} no existe en el servidor.`);
      }
    }

    const current = readStoreSync().data;
    const next: Record<string, StoredProduct> = { ...current.products };
    const slugs = new Set<string>();
    const categories = new Set<string>();
    const touch = (sku: string, stored: StoredProduct | undefined) => {
      const b = baseMap.get(sku);
      const slug = stored ? stored.slug : (b?.slug ?? null);
      const cat = stored ? stored.categoryId : (b?.categoryId ?? null);
      if (slug) slugs.add(slug);
      if (cat) categories.add(cat);
    };
    for (const input of inputs) {
      touch(input.sku, current.products[input.sku]);
      const { sku, ...stored } = input;
      next[sku] = stored;
      touch(sku, stored);
    }

    // Un slug no puede repetirse entre productos visibles (sería una ficha ambigua).
    const bySlug = new Map<string, string>();
    for (const b of base) {
      const s = next[b.sku];
      const slug = s ? (isVisible(s) ? s.slug : null) : b.slug;
      if (!slug) continue;
      const other = bySlug.get(slug);
      if (other && (seen.has(other) || seen.has(b.sku))) throw new DemoStoreError(409, "DUPLICATE_SLUG", `El slug «${slug}» lo usan los SKU ${other} y ${b.sku}.`);
      bySlug.set(slug, b.sku);
    }

    const file: StoreFile = { version: 1, products: next };
    await atomicWrite(productsFile(), JSON.stringify(file, null, 2));
    cached = null;
    return { saved: inputs.length, slugs: [...slugs], categories: [...categories] };
  });
}

/** Guarda una imagen subida. Devuelve la ruta tipo Storage y la URL pública. */
export function saveImage(
  base: readonly BaseRef[],
  sku: string,
  declaredType: string,
  bytes: Uint8Array,
): Promise<{ path: string; url: string; bytes: number }> {
  return serialize(async () => {
    requireEnabled();
    if (!SKU_RE.test(sku) || !base.some((b) => b.sku === sku)) throw new DemoStoreError(400, "SKU_NOT_FOUND", "El SKU no existe en el catálogo.");
    const check = checkImageUpload(declaredType, bytes);
    if (!check.ok) throw new DemoStoreError(check.code === "IMAGE_TOO_LARGE" ? 413 : 400, check.code, check.message);
    const dir = path.join(imagesDir(), sku);
    await mkdir(dir, { recursive: true });
    const existing = await readdir(dir).catch(() => [] as string[]);
    if (existing.length >= MAX_IMAGE_FILES_PER_SKU) {
      throw new DemoStoreError(400, "TOO_MANY_IMAGES", "Este producto alcanzó el máximo de archivos de la demo. Usa «Restablecer catálogo de la demo».");
    }
    // El nombre lo genera el servidor; nada del cliente participa en la ruta.
    const file = `${randomBytes(8).toString("hex")}.${check.kind}`;
    const full = resolveImageFile(sku, file);
    if (!full) throw new DemoStoreError(500, "INTERNAL", "No se pudo generar la ruta de la imagen.");
    const tmp = `${full}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, full);
    return { path: `products/${sku}/${file}`, url: `/api/demo-images/${sku}/${file}`, bytes: bytes.length };
  });
}

/** Borra todos los cambios guardados y las imágenes. */
export function resetStore(): Promise<void> {
  return serialize(async () => {
    requireEnabled();
    await rm(productsFile(), { force: true });
    await rm(imagesDir(), { recursive: true, force: true });
    cached = null;
  });
}
