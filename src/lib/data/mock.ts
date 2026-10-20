// IMPLEMENTACIÓN MOCK de la capa de datos (D-028). Solo para la demo; solo servidor.
// >>> En la integración con Firestore se REEMPLAZA este archivo por una
// implementación del mismo contrato `DataLayer` (consultas con
// where("published","==",true) y where("active","==",true), ver data-model.md)
// y solo cambia el export de ./index.ts. Las páginas no se tocan. <<<
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import fixture from "@/data/catalog.fixture.json";
import { computeFinalPrice } from "@/lib/admin/pricing";
import { mergeStoredIntoProduct, readStoreSync } from "@/lib/demo-store";
import type {
  Category,
  CategoryId,
  DataLayer,
  GetProductsOptions,
  Product,
  ProductDiscount,
} from "./types";
import { DEFAULT_SETTINGS as SETTINGS } from "./defaults";

interface CatalogRow {
  sku: string;
  name: string;
  slug: string;
  categoryId: CategoryId;
  price: number;
  inStock: boolean;
  format: string | null;
  unitsPerPack: number | null;
  family: string | null;
  discount?: ProductDiscount;
}

/** Usa src/data/catalog.local.json (generado desde la planilla, no versionado) si existe; si no, el fixture. */
function loadRows(): CatalogRow[] {
  const localPath = path.join(process.cwd(), "src", "data", "catalog.local.json");
  if (existsSync(localPath)) {
    const parsed = JSON.parse(readFileSync(localPath, "utf8")) as { products?: CatalogRow[] };
    if (Array.isArray(parsed.products) && parsed.products.length > 0) return parsed.products;
  }
  return (fixture as { products: CatalogRow[] }).products;
}

function toProduct(row: CatalogRow): Product {
  const discount = row.discount ?? null;
  return {
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    description: null,
    // Texto neutro, sin declaraciones de salud (normativa chilena). Los textos reales los carga el admin.
    shortDescription: `${row.name}. Suplemento alimentario en cápsulas.`,
    categoryId: row.categoryId,
    images: [],
    price: row.price,
    discount,
    finalPrice: computeFinalPrice(row.price, discount),
    inStock: row.inStock,
    format: row.format,
    unitsPerPack: row.unitsPerPack,
    family: row.family,
    seo: null,
  };
}

const CATEGORIES: Category[] = [
  { slug: "vitaminas", name: "Vitaminas", order: 10, seo: null, description: "Vitaminas en cápsulas para complementar tu alimentación diaria." },
  { slug: "magnesio", name: "Magnesio", order: 20, seo: null, description: "Magnesio en distintas formas: citrato, cloruro, bisglicinato y triple quelado." },
  { slug: "minerales", name: "Minerales", order: 30, seo: null, description: "Minerales como zinc y potasio, en cápsulas." },
  { slug: "omega-3", name: "Omega 3", order: 40, seo: null, description: "Suplementos de omega 3 y omega 369 en cápsulas." },
  { slug: "belleza", name: "Belleza", order: 50, seo: null, description: "Colágeno y biotina para tu rutina de belleza y bienestar." },
  { slug: "bienestar", name: "Bienestar", order: 60, seo: null, description: "Spirulina, cúrcuma, melena de león, cranberry y la línea Ultra." },
];

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

let baseCache: Product[] | null = null;
/** Catálogo base sin cambios guardados (ordenado por nombre). */
function baseProducts(): Product[] {
  baseCache ??= loadRows()
    .map(toProduct)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  return baseCache;
}

// Catálogo visible = base + cambios guardados por el admin (D-030, solo con DEMO_PERSISTENCE).
// Un producto eliminado, despublicado o inactivo no aparece (D-029). Se recalcula solo cuando
// el archivo guardado cambia.
let mergedCache: { key: string; list: Product[] } | null = null;
function allProducts(): Product[] {
  const { key, data } = readStoreSync();
  if (key === "off" || key === "none") return baseProducts();
  if (mergedCache?.key === key) return mergedCache.list;
  const list: Product[] = [];
  for (const base of baseProducts()) {
    const stored = data.products[base.sku];
    if (!stored) {
      list.push(base);
      continue;
    }
    const merged = mergeStoredIntoProduct(base, stored);
    if (merged) list.push(merged);
  }
  list.sort((a, b) => a.name.localeCompare(b.name, "es"));
  mergedCache = { key, list };
  return list;
}

/** Solo demo (D-030): catálogo base completo, con los cambios del admin sin aplicar. */
export function getBaseCatalog(): Product[] {
  return baseProducts();
}

export const mockDataLayer: DataLayer = {
  async getCategories() {
    return [...CATEGORIES].sort((a, b) => a.order - b.order);
  },

  async getCategory(slug) {
    return CATEGORIES.find((c) => c.slug === slug) ?? null;
  },

  async getProducts({ category, q, limit }: GetProductsOptions = {}) {
    let list = allProducts();
    if (category) list = list.filter((p) => p.categoryId === category);
    const query = q ? normalize(q).trim() : "";
    if (query) {
      const terms = query.split(/\s+/);
      list = list.filter((p) => {
        const haystack = normalize(p.name);
        return terms.every((t) => haystack.includes(t));
      });
    }
    return limit && limit > 0 ? list.slice(0, limit) : list;
  },

  async getProduct(slug) {
    return allProducts().find((p) => p.slug === slug) ?? null;
  },

  async getRelatedProducts(sku, limit = 4) {
    const base = allProducts().find((p) => p.sku === sku);
    if (!base) return [];
    const others = allProducts().filter((p) => p.sku !== sku);
    // Primero los otros tamaños de la misma familia, luego el resto de la categoría.
    const sameFamily = others.filter((p) => base.family && p.family === base.family);
    const sameCategory = others.filter((p) => p.categoryId === base.categoryId && !sameFamily.includes(p));
    return [...sameFamily, ...sameCategory].slice(0, limit);
  },

  async getPublicSettings() {
    return SETTINGS;
  },
};
