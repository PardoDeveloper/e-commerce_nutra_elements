import { isEmptyCell, type Cell } from "./cells.js";

// Código de barras (data-model.md 2.1): `barcode` tal cual, `barcodeValid` por dígito verificador
// GTIN-8/12/13/14 y `gtin` solo si es válido y no está en el rango ISBN (978/979).

const MAX_BARCODE_LENGTH = 32;

export interface BarcodeInfo {
  barcode: string | null;
  barcodeValid: boolean;
  gtin: string | null;
  /** Empieza con 978 o 979 (rango ISBN): se advierte y no se publica como GTIN. */
  isbnRange: boolean;
  /** Más de 32 caracteres: se descarta. */
  tooLong: boolean;
}

/** Dígito verificador GTIN (pesos 3 y 1 desde la derecha, sin contar el verificador). */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

export function analyzeBarcode(cell: Cell | undefined): BarcodeInfo {
  const empty: BarcodeInfo = { barcode: null, barcodeValid: false, gtin: null, isbnRange: false, tooLong: false };
  if (isEmptyCell(cell)) return empty;
  let text: string;
  if (typeof cell === "number") {
    if (!Number.isSafeInteger(cell) || cell < 0) return empty;
    text = String(cell);
  } else {
    text = String(cell).trim();
  }
  if (text.length > MAX_BARCODE_LENGTH) return { ...empty, tooLong: true };
  // Caracteres de control fuera: el código se muestra en el admin.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F-\u009F]/.test(text)) return empty;
  const barcodeValid = isValidGtin(text);
  const isbnRange = /^97[89]/.test(text);
  return { barcode: text, barcodeValid, gtin: barcodeValid && !isbnRange ? text : null, isbnRange, tooLong: false };
}
