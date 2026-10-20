import type { BatchReport, CorrectedCell, InvalidRow, PlannedChange, Warning } from "./types.js";

/** Las listas del reporte se recortan a 500 entradas (límite de 1 MiB por documento, data-model.md 2.7). */
export const MAX_LIST = 500;

/** Acumula el resultado de uno o más lotes. Se puede combinar con `merge`. */
export class Collector {
  corrected: CorrectedCell[] = [];
  invalid: InvalidRow[] = [];
  warnings: Warning[] = [];
  changes: PlannedChange[] = [];
  created = 0;
  updated = 0;
  unchanged = 0;

  reject(row: number, code: string, message: string, sku?: string): void {
    const entry: InvalidRow = { row, code, message };
    if (sku !== undefined) entry.sku = sku;
    this.invalid.push(entry);
  }

  warn(code: string, message: string, sku?: string): void {
    const entry: Warning = { code, message };
    if (sku !== undefined) entry.sku = sku;
    this.warnings.push(entry);
  }

  merge(other: Collector): void {
    this.corrected.push(...other.corrected);
    this.invalid.push(...other.invalid);
    this.warnings.push(...other.warnings);
    this.changes.push(...other.changes);
    this.created += other.created;
    this.updated += other.updated;
    this.unchanged += other.unchanged;
  }
}

export interface ReportMeta {
  rows: number;
  dryRun: boolean;
  importId: string | null;
}

/** Reporte final: filas inválidas ordenadas por fila, listas recortadas y `truncated` si hubo recorte. */
export function buildReport(c: Collector, meta: ReportMeta): BatchReport {
  const invalid = [...c.invalid].sort((a, b) => a.row - b.row);
  const truncated = [c.corrected, invalid, c.warnings, c.changes].some((list) => list.length > MAX_LIST);
  return {
    importId: meta.importId,
    dryRun: meta.dryRun,
    rows: meta.rows,
    created: c.created,
    updated: c.updated,
    unchanged: c.unchanged,
    skipped: invalid.length,
    corrected: c.corrected.slice(0, MAX_LIST),
    invalid: invalid.slice(0, MAX_LIST),
    warnings: c.warnings.slice(0, MAX_LIST),
    truncated,
    changes: c.changes.slice(0, MAX_LIST),
  };
}
