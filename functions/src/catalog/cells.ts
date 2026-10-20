// Parseo de celdas crudas de Excel (functions.md 5, reglas comunes de los lotes). Lógica pura.
// El cliente envía las celdas sin interpretar; aquí el servidor es la autoridad.

/** Celda cruda de la planilla. */
export type Cell = string | number | null;

export const SKU_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const MAX_PRICE = 10_000_000;
export const MAX_STOCK = 1_000_000;

export function isEmptyCell(cell: Cell | undefined): boolean {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

/** SKU como texto: `2427844` y `"2427844.0"` dan `"2427844"`; decimales reales o caracteres raros, `null`. */
export function normalizeSku(cell: Cell | undefined): string | null {
  if (cell === null || cell === undefined) return null;
  let text: string;
  if (typeof cell === "number") {
    if (!Number.isFinite(cell) || !Number.isInteger(cell)) return null;
    text = String(cell);
  } else {
    text = cell.trim().replace(/^(\d+)\.0+$/, "$1");
  }
  return SKU_PATTERN.test(text) ? text : null;
}

export type NumberParse = { ok: true; value: number } | { ok: false };

/**
 * Entero de una celda. Acepta número entero o texto con separador chileno de miles ("12.990",
 * "$12.990") y decimales en cero ("12,0", "12.00"). Un texto como "1,000" (miles al estilo
 * anglosajón) o "1,5" es inválido: es ambiguo y no se adivina.
 */
function parseIntegerCell(cell: Cell | undefined): NumberParse {
  if (typeof cell === "number") {
    return Number.isFinite(cell) && Number.isInteger(cell) ? { ok: true, value: cell + 0 } : { ok: false };
  }
  if (typeof cell !== "string") return { ok: false };
  let text = cell.trim().replace(/^\$\s*/, "");
  if (/^-?\d{1,3}(\.\d{3})+(,0{1,2})?$/.test(text)) text = text.replace(/\./g, "");
  text = text.replace(/[.,]0{1,2}$/, "");
  if (!/^-?\d{1,16}$/.test(text)) return { ok: false };
  return { ok: true, value: Number(text) + 0 };
}

/** Precio CLP: entero 1..10.000.000 (`INVALID_PRICE` si no). */
export function parsePrice(cell: Cell | undefined): NumberParse {
  const value = parseIntegerCell(cell);
  if (!value.ok || value.value < 1 || value.value > MAX_PRICE) return { ok: false };
  return value;
}

export type StockParse =
  | { kind: "ok"; value: number }
  | { kind: "corrected"; value: 0; from: Cell }
  | { kind: "empty" }
  | { kind: "invalid" };

/**
 * STOCK físico. Vacío = `empty` (el llamador decide: fila inválida o 0 en la importación inicial);
 * texto no numérico o fuera de 0..1.000.000 = `invalid`; negativo se corrige a 0.
 */
export function parseStock(cell: Cell | undefined): StockParse {
  if (isEmptyCell(cell)) return { kind: "empty" };
  const parsed = parseIntegerCell(cell);
  if (!parsed.ok) return { kind: "invalid" };
  if (parsed.value < 0) return { kind: "corrected", value: 0, from: cell ?? null };
  if (parsed.value > MAX_STOCK) return { kind: "invalid" };
  return { kind: "ok", value: parsed.value };
}
