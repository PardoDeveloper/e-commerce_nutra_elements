// Reglas puras para convertir una fila de la planilla en un producto de la demo.
// Las usa scripts/build-demo-catalog.mjs (Node 24 ejecuta TypeScript sin compilar)
// y tienen tests. Sin imports: debe poder correr tanto en Node como en Next.

export type CategoryId =
  | "vitaminas"
  | "magnesio"
  | "minerales"
  | "omega-3"
  | "belleza"
  | "bienestar";

/**
 * MAPEO DE CATEGORÍAS (D-023). Se evalúa en orden: gana la primera regla que
 * coincida. Para corregir una asignación, edita esta tabla (o mueve la regla).
 * Las palabras se buscan en el nombre sin tildes y en minúsculas.
 */
export const CATEGORY_RULES: ReadonlyArray<{ category: CategoryId; keywords: string[] }> = [
  // Zinc y potasio antes que "ultra": "Ultra Zinc" es un mineral (contrato data-model 2.2).
  { category: "minerales", keywords: ["zinc", "potasio"] },
  { category: "bienestar", keywords: ["ultra"] },
  { category: "magnesio", keywords: ["magnesio"] },
  { category: "omega-3", keywords: ["omega"] },
  { category: "belleza", keywords: ["colageno", "biotina"] },
  // Cranberry lleva vitaminas en el nombre pero va en bienestar (D-023): antes que vitaminas.
  { category: "bienestar", keywords: ["spirulina", "melena", "curcuma", "cranberry"] },
  { category: "vitaminas", keywords: ["vitamina", "vit ", "b-complex", "b12"] },
];
export const DEFAULT_CATEGORY: CategoryId = "bienestar";

/** Correcciones de ortografía para el nombre para mostrar (D-018). Clave: palabra en minúsculas. */
export const WORD_FIXES: Record<string, string> = {
  colageno: "Colágeno",
  curcuma: "Cúrcuma",
  leon: "León",
  vit: "Vitamina",
  caps: "cápsulas",
};
/** Frases a reemplazar antes de pasar a formato título. */
export const PHRASE_FIXES: Array<[RegExp, string]> = [
  [/citrato potasio/gi, "citrato de potasio"],
  [/cloruro magnesio/gi, "cloruro de magnesio"],
  [/curcuma pimienta/gi, "cúrcuma con pimienta"],
];
const LOWERCASE_WORDS = new Set(["de", "con", "y", "x", "en", "del"]);
const KEEP_UPPER = new Set(["ui", "mg"]);
const BRAND_SUFFIX = /\s+nutra elements\s*$/i;

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function categorize(sourceName: string): { category: CategoryId; matched: boolean } {
  const haystack = ` ${stripAccents(sourceName).toLowerCase()} `;
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => haystack.includes(k))) {
      return { category: rule.category, matched: true };
    }
  }
  return { category: DEFAULT_CATEGORY, matched: false };
}

/** "VITAMINA B12 X 90 CAPS NUTRA ELEMENTS" -> "Vitamina B12 x 90 cápsulas". */
export function displayName(sourceName: string): string {
  let text = sourceName.trim().replace(BRAND_SUFFIX, "").replace(/\s+/g, " ");
  for (const [pattern, replacement] of PHRASE_FIXES) text = text.replace(pattern, replacement);
  const words = text.split(" ").map((raw, index) => {
    const lower = raw.toLowerCase();
    if (WORD_FIXES[lower]) return WORD_FIXES[lower];
    if (KEEP_UPPER.has(lower)) return lower === "ui" ? "UI" : "mg";
    if (/^\d/.test(lower) || lower === "+") return lower;
    if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
    // B12, B-Complex: capitaliza cada tramo separado por guion.
    return lower
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("-");
  });
  // Formato uniforme del tamaño: siempre "x 90 cápsulas".
  return words.join(" ").replace(/(?<!\bx )\b(\d{1,4}) cápsulas$/, "x $1 cápsulas");
}

export function slugify(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/\+/g, " ")
    .replace(/\bx\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

/** Unidades por envase: "x 90 cápsulas" -> 90. */
export function unitsPerPack(name: string): number | null {
  const m = /(\d{1,4})\s*c[aá]psulas/i.exec(name);
  return m ? Number(m[1]) : null;
}

/** Familia: el slug sin el tamaño ("vitamina-b12-90-capsulas" -> "vitamina-b12"). */
export function familyOf(slug: string): string {
  return slug.replace(/-\d{1,4}-capsulas$/, "");
}

/** Los productos del catálogo local. Nunca incluye la cantidad de stock. */
export interface DemoCatalogProduct {
  sku: string;
  sourceName: string;
  name: string;
  slug: string;
  categoryId: CategoryId;
  price: number;
  inStock: boolean;
  format: "capsulas";
  unitsPerPack: number | null;
  family: string;
}

export interface SourceRow {
  ID: unknown;
  NOMBRE: unknown;
  PRECIO_VENTA_PUBLICO: unknown;
  STOCK_ACTUAL: unknown;
}

export function rowToProduct(row: SourceRow): DemoCatalogProduct | null {
  const sku = String(row.ID ?? "").trim();
  const sourceName = String(row.NOMBRE ?? "").trim();
  const price = Math.round(Number(row.PRECIO_VENTA_PUBLICO));
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(sku) || sourceName === "" || !Number.isFinite(price) || price < 1) {
    return null;
  }
  const stock = Number(row.STOCK_ACTUAL);
  const name = displayName(sourceName);
  const slug = slugify(name);
  return {
    sku,
    sourceName,
    name,
    slug,
    categoryId: categorize(sourceName).category,
    price,
    // D-018: stock negativo o vacío cuenta como 0. Solo se conserva el sí/no.
    inStock: Number.isFinite(stock) && stock > 0,
    format: "capsulas",
    unitsPerPack: unitsPerPack(name),
    family: familyOf(slug),
  };
}
