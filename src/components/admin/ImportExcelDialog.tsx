"use client";

// Importar la planilla de Control Farma desde Productos (functions.md 5.1). El SKU (ID) manda: los nuevos se crean sin
// publicar y los existentes actualizan precio, stock y datos de la planilla, sin tocar contenido ni descuentos.
// El archivo se lee en el navegador; primero se muestra la vista previa (dryRun) y luego se aplica.
import { useId, useRef, useState, type DragEvent } from "react";
import { errorMessage } from "@/lib/admin/errors";
import { parseSpreadsheet } from "@/lib/admin/excel-file";
import { sim } from "@/lib/admin/mode";
import type { BatchReport, CatalogRow, Cell, PlannedChange } from "@/lib/admin/types";
import { formatClp } from "@/lib/format";
import { AdminDialog } from "./AdminDialog";
import { useAdminService } from "./AdminProvider";
import ui from "./admin.module.css";
import styles from "./import.module.css";

const FIELD_LABEL: Record<PlannedChange["field"], string> = {
  price: "Precio",
  stock: "Stock",
  discount: "Precio final",
  create: "Nuevo",
};

function formatCell(change: PlannedChange, value: Cell): string {
  if (value === null) return "—";
  if (change.field === "stock") return String(value);
  return typeof value === "number" ? formatClp(value) : String(value);
}

type Prepared = { fileName: string; rows: Record<string, Cell>[]; report: BatchReport };

export function ImportExcelDialog({ onClose, onApplied }: { onClose: () => void; onApplied: (text: string) => void }) {
  const service = useAdminService();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  const run = (rows: Record<string, Cell>[], dryRun: boolean, fileName: string) =>
    // Filas crudas: el servidor es la autoridad de la validación.
    service.importCatalog({ rows: rows as unknown as CatalogRow[], dryRun, fileName });

  async function onFile(file: File | undefined) {
    setPrepared(null);
    setError(null);
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseSpreadsheet(file, "catalog");
      if (!parsed.ok) return void setError(parsed.message);
      setPrepared({ fileName: file.name, rows: parsed.rows, report: await run(parsed.rows, true, file.name) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function apply() {
    if (!prepared) return;
    setBusy(true);
    setError(null);
    try {
      const r = await run(prepared.rows, false, prepared.fileName);
      const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
      const parts = [n(r.created, "nuevo", "nuevos"), n(r.updated, "actualizado", "actualizados")];
      if (r.unchanged) parts.push(`${r.unchanged} sin cambios`);
      if (r.skipped) parts.push(`${r.skipped} omitidos`);
      onApplied(sim(`Planilla aplicada (simulado): ${parts.join(", ")}.`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (!busy) void onFile(e.dataTransfer.files[0]);
  }

  const report = prepared?.report;
  const pending = report ? report.created + report.updated : 0;

  return (
    <AdminDialog title="Importar Excel" wide busy={busy} onClose={onClose}>
      <label
        htmlFor={`${id}-file`}
        className={`${styles.drop} ${dragging ? styles.dropActive : ""} ${busy ? styles.dropBusy : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15V4" />
          <path d="M7.5 8.5 12 4l4.5 4.5" />
          <path d="M4.5 15v4.5h15V15" />
        </svg>
        <span className={styles.dropTitle}>{busy ? "Procesando…" : prepared ? `«${prepared.fileName}» · elegir otro archivo` : "Arrastra la planilla o haz clic para elegirla"}</span>
        <span className={styles.dropHint}>.xls, .xlsx o .csv · hasta 5 MiB · se lee en tu navegador</span>
        <input
          ref={inputRef}
          id={`${id}-file`}
          type="file"
          className="visually-hidden"
          accept=".xls,.xlsx,.csv"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>

      {!prepared ? (
        <p className={ui.help}>
          El SKU (ID) manda: los productos nuevos se crean sin publicar y los existentes actualizan precio y stock. El contenido y los descuentos no se tocan.
        </p>
      ) : null}

      {error ? (
        <p className={`${ui.alert} ${ui.alertError}`} role="alert">
          {error}
        </p>
      ) : null}

      {prepared && report ? (
        <div className={styles.preview} aria-live="polite">
          <ul className={styles.summary} aria-label="Resumen">
            <li className={styles.statNew}>
              <strong>{report.created}</strong> nuevos
            </li>
            <li className={styles.statUpdated}>
              <strong>{report.updated}</strong> actualizados
            </li>
            <li>
              <strong>{report.unchanged}</strong> sin cambios
            </li>
            <li className={report.invalid.length ? styles.statInvalid : ""}>
              <strong>{report.invalid.length}</strong> con errores
            </li>
          </ul>

          {report.changes.length > 0 ? (
            <details className={styles.group} open={report.changes.length <= 30}>
              <summary>Cambios ({report.changes.length})</summary>
              <div className={ui.tableWrap} role="region" aria-label="Cambios" tabIndex={0}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">SKU</th>
                      <th scope="col">Producto</th>
                      <th scope="col">Campo</th>
                      <th scope="col" className={ui.num}>
                        Antes
                      </th>
                      <th scope="col" className={ui.num}>
                        Después
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.changes.map((c) => (
                      <tr key={`${c.row}-${c.field}`}>
                        <td className={ui.mono}>{c.sku}</td>
                        <td>{c.name}</td>
                        <td>
                          <span className={`${ui.badge} ${c.field === "create" ? ui.badgeOk : ""}`}>{FIELD_LABEL[c.field]}</span>
                        </td>
                        <td className={ui.num}>{formatCell(c, c.from)}</td>
                        <td className={ui.num}>{formatCell(c, c.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : (
            <p className={ui.empty}>La planilla no trae cambios: todo está al día.</p>
          )}

          {report.invalid.length > 0 ? (
            <details className={styles.group} open>
              <summary>Filas con errores ({report.invalid.length}) · se omiten</summary>
              <div className={ui.tableWrap} role="region" aria-label="Filas con errores" tabIndex={0}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">Fila</th>
                      <th scope="col">SKU</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.invalid.map((r) => (
                      <tr key={`${r.row}-${r.code}`} className={ui.rowInvalid}>
                        <td>{r.row}</td>
                        <td className={ui.mono}>{r.sku ?? "—"}</td>
                        <td>{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          {report.corrected.length > 0 || report.warnings.length > 0 ? (
            <details className={styles.group}>
              <summary>Avisos ({report.corrected.length + report.warnings.length})</summary>
              <ul className={styles.notes}>
                {report.corrected.map((c) => (
                  <li key={`c-${c.row}-${c.field}`}>
                    SKU {c.sku}: {c.field} {String(c.from ?? "vacío")} → {String(c.to)}.
                  </li>
                ))}
                {report.warnings.map((w, i) => (
                  <li key={`w-${w.code}-${w.sku ?? ""}-${i}`}>
                    {w.sku ? `SKU ${w.sku}: ` : ""}
                    {w.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {report.truncated ? <p className={ui.help}>Las listas muestran hasta 500 filas.</p> : null}

          <div className={ui.actions}>
            <button type="button" className={ui.btn} onClick={() => void apply()} disabled={busy || pending === 0}>
              {busy ? "Aplicando…" : sim(`Aplicar ${pending} ${pending === 1 ? "cambio" : "cambios"} (simulado)`)}
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </AdminDialog>
  );
}
