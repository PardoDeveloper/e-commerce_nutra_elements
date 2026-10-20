// Lectura de planillas en el NAVEGADOR con SheetJS (xlsx 0.20.3, desde el CDN oficial de SheetJS).
// El archivo no sale del equipo: se convierte en filas crudas y estas van a la función de lote.
// La librería se carga con import() dinámico para no pesar en el resto del panel.
import { extractRows, type ExtractResult, type SheetKind } from "./batch";

export const MAX_SHEET_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".xls", ".xlsx", ".csv"];
/** Hoja de la planilla de Control Farma (functions.md 5.1). */
export const CATALOG_SHEET = "ARTICULO";

export type ParsedSheet =
  | { ok: true; kind: SheetKind; rows: Record<string, string | number | null>[]; sheetName: string; usedFallbackSheet: boolean }
  | { ok: false; message: string };

export async function parseSpreadsheet(file: File, kind: SheetKind): Promise<ParsedSheet> {
  const lower = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { ok: false, message: "Formato no admitido. Usa un archivo .xls, .xlsx o .csv." };
  }
  if (file.size === 0) return { ok: false, message: "El archivo está vacío." };
  if (file.size > MAX_SHEET_BYTES) return { ok: false, message: "El archivo supera los 5 MiB." };

  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const wanted = kind === "catalog" ? workbook.SheetNames.find((n) => n.toUpperCase() === CATALOG_SHEET) : undefined;
    const sheetName = wanted ?? workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheetName || !sheet) return { ok: false, message: "El archivo no tiene hojas." };
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    const extracted: ExtractResult = extractRows(matrix, kind);
    if (!extracted.ok) {
      return { ok: false, message: `Faltan columnas obligatorias en la hoja «${sheetName}»: ${extracted.missing.join(", ")}.` };
    }
    return { ok: true, kind, rows: extracted.rows, sheetName, usedFallbackSheet: kind === "catalog" && !wanted };
  } catch {
    return { ok: false, message: "No se pudo leer el archivo. Revisa que sea una planilla válida." };
  }
}
