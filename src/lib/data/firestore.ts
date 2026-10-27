// IMPLEMENTACIÓN FIRESTORE de la capa de datos (D-031). Solo servidor.
// Lee con el SDK de cliente (lite) bajo las reglas públicas; no usa el Admin SDK.
// Las consultas de `products` llevan SIEMPRE published == true, active == true y deletedAt == null:
// las reglas rechazan cualquier consulta sin esos tres filtros (data-model 2.1).
import { collection, doc, getDoc, getDocs, limit as limitTo, orderBy, query, where, type QueryConstraint } from "firebase/firestore/lite";
import { getServerFirestore, storagePublicUrl } from "@/lib/firebase/server";
import { DEFAULT_CATEGORIES } from "./defaults";
import { mapCategory, mapProduct, mapSettings } from "./firestore-map";
import type { Category, DataLayer, GetProductsOptions, Product } from "./types";

const PUBLIC_FILTERS = (): QueryConstraint[] => [
  where("published", "==", true),
  where("active", "==", true),
  where("deletedAt", "==", null),
];

// Los avisos de datos faltantes se registran una vez por proceso (el build consulta muchas veces).
const warned = new Set<string>();
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Durante `next build` un fallo de lectura (Firestore vacío, sin base de datos, sin red) no debe romper
 * el build: se registra y se usa el valor de respaldo. En ejecución se propaga para que ISR conserve la
 * última página buena en lugar de guardar un catálogo vacío por un error pasajero.
 */
async function guarded<T>(label: string, fallback: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const code = (error as { code?: string }).code ?? "unknown";
    console.error(`[data/firestore] ${label} falló (${code}):`, (error as Error).message);
    if (process.env.NEXT_PHASE === "phase-production-build") return fallback;
    throw error;
  }
}

async function readProducts(extra: QueryConstraint[] = [], ordered = true): Promise<Product[]> {
  const db = getServerFirestore();
  const snap = await getDocs(query(collection(db, "products"), ...PUBLIC_FILTERS(), ...extra, ...(ordered ? [orderBy("name")] : [])));
  const products: Product[] = [];
  for (const d of snap.docs) {
    const product = mapProduct(d.id, d.data(), (p) => storagePublicUrl(p));
    if (product) products.push(product);
    else console.warn(`[data/firestore] producto ${d.id} omitido: faltan slug, nombre o precio válidos`);
  }
  return products;
}

async function readCategories(): Promise<Category[]> {
  const db = getServerFirestore();
  // Solo un filtro de igualdad (índice automático); el orden se aplica en memoria.
  const snap = await getDocs(query(collection(db, "categories"), where("published", "==", true)));
  // Sin categorías publicadas la lista queda vacía: el admin las crea, renombra y elimina (D-040).
  const categories = snap.docs.flatMap((d) => mapCategory(d.id, d.data()) ?? []);
  return categories.sort((a, b) => a.order - b.order);
}

const getCategories = () => guarded("categorías", DEFAULT_CATEGORIES, readCategories);

async function getCategory(slug: string): Promise<Category | null> {
  if (!SLUG.test(slug)) return null;
  return (await getCategories()).find((c) => c.slug === slug) ?? null;
}

async function getProducts({ category, q, limit }: GetProductsOptions = {}): Promise<Product[]> {
  if (category !== undefined && !SLUG.test(category)) return [];
  let list = await guarded("productos", [] as Product[], () =>
    readProducts(category ? [where("categoryId", "==", category)] : []),
  );
  const search = q ? normalize(q).trim() : "";
  if (search) {
    const terms = search.split(/s+/);
    list = list.filter((p) => {
      const haystack = normalize(p.name);
      return terms.every((t) => haystack.includes(t));
    });
  }
  return limit && limit > 0 ? list.slice(0, limit) : list;
}

async function getProduct(slug: string): Promise<Product | null> {
  if (!SLUG.test(slug) || slug.length > 80) return null;
  // Sin orderBy: con un solo resultado no hace falta y evita exigir otro índice compuesto.
  const list = await guarded("producto", [] as Product[], () => readProducts([where("slug", "==", slug), limitTo(1)], false));
  return list[0] ?? null;
}

async function getRelatedProducts(sku: string, limit = 4): Promise<Product[]> {
  const all = await getProducts();
  const base = all.find((p) => p.sku === sku);
  if (!base) return [];
  const others = all.filter((p) => p.sku !== sku);
  // Productos de la misma categoría (sin categoría no hay relacionados).
  if (base.categoryId === null) return [];
  return others.filter((p) => p.categoryId === base.categoryId).slice(0, limit);
}

async function getPublicSettings() {
  return guarded("ajustes", mapSettings(undefined), async () => {
    const snap = await getDoc(doc(getServerFirestore(), "settings", "public"));
    if (!snap.exists()) {
      warnOnce("[data/firestore] settings/public no existe: se usan los valores por defecto");
      return mapSettings(undefined);
    }
    return mapSettings(snap.data());
  });
}

// Funciones sueltas (sin `this`): index.ts las re-exporta una por una.
export const firestoreDataLayer: DataLayer = { getCategories, getCategory, getProducts, getProduct, getRelatedProducts, getPublicSettings };
