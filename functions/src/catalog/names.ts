// Propuestas a partir del NOMBRE de la planilla (functions.md 5.1). Son solo sugerencias: el admin
// corrige el nombre y el formato después.

const LOWER_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "con", "en", "para", "por", "x"]);
const UNITS = new Set(["mg", "mcg", "g", "ui", "ml", "kg"]);
const MAX_DISPLAY_NAME = 120;

function capitalizePart(part: string): string {
  if (part.length === 0) return part;
  // Una letra sola (vitamina C, D, E) o letra + número (B12) va en mayúscula.
  if (part.length === 1 || /^[a-z]\d+$/.test(part)) return part.toUpperCase();
  return part.charAt(0).toUpperCase() + part.slice(1);
}

/** "CITRATO DE MAGNESIO X 120 CAPS" -> "Citrato de Magnesio x 120 cápsulas" (máx. 120 caracteres). */
export function proposeDisplayName(sourceName: string): string {
  const words = sourceName.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const out = words.map((word, i) => {
    if (word === "caps" || word === "capsulas" || word === "cápsulas") return "cápsulas";
    if (UNITS.has(word)) return word;
    if (i > 0 && LOWER_WORDS.has(word)) return word;
    return word.split("-").map(capitalizePart).join("-");
  });
  return out.join(" ").slice(0, MAX_DISPLAY_NAME).trim();
}

/** Slug sin tildes: letras y números separados por guiones. */
export function slugify(text: string, maxLength = 80): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export interface PackInfo {
  unitsPerPack: number | null;
  format: string | null;
}

/** Extrae "X 90 CAPS" del nombre: unidades por envase y formato. */
export function extractPackInfo(sourceName: string): PackInfo {
  const match = /\bX\s*(\d{1,4})\b/i.exec(sourceName);
  if (!match) return { unitsPerPack: null, format: null };
  const units = Number(match[1]);
  if (units < 1 || units > 1000) return { unitsPerPack: null, format: null };
  const rest = sourceName.slice((match.index ?? 0) + match[0].length);
  const format = /\bCAPS(ULAS)?\b|\bCÁPSULAS\b/i.test(rest) ? "capsulas" : null;
  return { unitsPerPack: units, format };
}
