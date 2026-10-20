import * as logger from "firebase-functions/logger";
import { chunkItems, type ChunkPlan, type Item } from "./prepare.js";
import { buildReport, Collector } from "./report.js";
import type { CatalogStore, CatalogTx, ImportRecord } from "./store.js";
import type { BatchReport, ImportKind } from "./types.js";

/** Productos por transacción (functions.md 5, reglas comunes). 200 escrituras << límite de 500. */
export const TX_CHUNK_SIZE = 200;

export interface BatchJob<T> {
  kind: ImportKind;
  uid: string;
  dryRun: boolean;
  fileName: string | null;
  /** Filas o SKU recibidos (va en `rows` del reporte). */
  rows: number;
  /** Rechazos del paso previo (SKU inválidos o repetidos). */
  pre: Collector;
  items: readonly Item<T>[];
  /** Lee, decide y devuelve las operaciones de un trozo. Debe poder repetirse (reintentos de la transacción). */
  plan: (tx: CatalogTx, chunk: Item<T>[]) => Promise<ChunkPlan>;
}

function toImportRecord(job: Pick<BatchJob<unknown>, "kind" | "uid" | "fileName">, report: BatchReport): ImportRecord {
  return {
    kind: job.kind,
    dryRun: false,
    fileName: job.fileName,
    rows: report.rows,
    created: report.created,
    updated: report.updated,
    unchanged: report.unchanged,
    skipped: report.skipped,
    corrected: report.corrected,
    invalid: report.invalid,
    warnings: report.warnings,
    truncated: report.truncated,
    createdBy: job.uid,
  };
}

/**
 * Ejecuta un lote: una transacción por trozo de 200 productos y, al final, el registro en `imports`
 * (auditoría). Con `dryRun` usa transacciones de solo lectura, no escribe y no crea `imports`.
 * Si un trozo falla después de que otros ya se aplicaron, deja igual un registro parcial en
 * `imports` (con la advertencia `PARTIAL_FAILURE`) y relanza el error: repetir el lote es seguro,
 * porque cada fila es idempotente por SKU.
 */
export async function runBatch<T>(store: CatalogStore, job: BatchJob<T>): Promise<BatchReport> {
  const total = new Collector();
  total.merge(job.pre);
  let appliedChunks = 0;

  try {
    for (const chunk of chunkItems(job.items, TX_CHUNK_SIZE)) {
      const plan = await store.runTransaction(
        async (tx) => {
          const p = await job.plan(tx, chunk);
          if (!job.dryRun && p.ops.length > 0) tx.apply(p.ops, { uid: job.uid });
          return p;
        },
        { readOnly: job.dryRun },
      );
      total.merge(plan.collector);
      plan.commit?.();
      if (!job.dryRun && plan.ops.length > 0) appliedChunks++;
    }
  } catch (err) {
    if (!job.dryRun && appliedChunks > 0) {
      total.warn("PARTIAL_FAILURE", "El lote se interrumpió: algunos productos ya se aplicaron. Repite la operación.");
      const partial = buildReport(total, { rows: job.rows, dryRun: false, importId: null });
      try {
        await store.saveImport(toImportRecord(job, partial));
      } catch {
        logger.error("No se pudo guardar el registro parcial de la importación", { kind: job.kind });
      }
    }
    throw err;
  }

  if (job.dryRun) return buildReport(total, { rows: job.rows, dryRun: true, importId: null });

  const draft = buildReport(total, { rows: job.rows, dryRun: false, importId: null });
  const importId = await store.saveImport(toImportRecord(job, draft));
  const report: BatchReport = { ...draft, importId };
  logger.info("Lote del catálogo aplicado", {
    kind: job.kind,
    importId,
    rows: report.rows,
    created: report.created,
    updated: report.updated,
    unchanged: report.unchanged,
    skipped: report.skipped,
    truncated: report.truncated,
  });
  return report;
}
