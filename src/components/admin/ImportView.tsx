"use client";

// Importación de Excel: lectura en el navegador, vista previa (dryRun) y "Aplicar".
import { useId, useRef, useState } from "react";
import type { SheetKind } from "@/lib/admin/batch";
import { errorMessage } from "@/lib/admin/errors";
import { parseSpreadsheet } from "@/lib/admin/excel-file";
import type { BatchReport, CatalogRow, Cell, PlannedChange, PriceRow, StockRow } from "@/lib/admin/types";
import { formatClp } from "@/lib/format";
import { useAdminService } from "./AdminProvider";
import ui from "./admin.module.css";
import { sim } from "@/lib/admin/mode";

interface TabInfo {
  kind: SheetKind;
  label: string;
  columns: string;
  help: string;
}

const TABS: TabInfo[] = [
  {
    kind: "catalog",
    label: "Planilla de Control Farma",
    columns: "ID, NOMBRE, CODIGO_BARRA, STOCK_ACTUAL, PRECIO_VENTA_PUBLICO, ACTIVO, LABORATORIO",
    help: "Hoja ARTICULO. Crea los productos nuevos (sin publicar) y en los existentes actualiza precio y stock, sin tocar el contenido ni los descuentos. Un SKU de un producto eliminado es una fila inválida (PRODUCT_DELETED): no se revive ni se cambia.",
  },
  {
    kind: "prices",
    label: "SKU + PRECIO",
    columns: "SKU, PRECIO",
    help: "Cambio masivo de precios de productos existentes. Un SKU inexistente es una fila inválida. Un SKU de un producto eliminado es una fila inválida (PRODUCT_DELETED): no se revive ni se cambia.",
  },
  {
    kind: "stock",
    label: "SKU + STOCK",
    columns: "SKU, STOCK",
    help: "Stock físico por SKU. Una celda vacía es una fila inválida (EMPTY_STOCK) y no se toca el producto. Un SKU de un producto eliminado es una fila inválida (PRODUCT_DELETED): no se revive ni se cambia.",
  },
];

const FIELD_LABEL: Record<PlannedChange["field"], string> = {
  price: "Precio",
  stock: "Stock",
  discount: "Precio final",
  create: "Producto nuevo",
};

function formatCell(change: PlannedChange, value: Cell): string {
  if (value === null) return "—";
  if (change.field === "stock") return String(value);
  return typeof value === "number" ? formatClp(value) : String(value);
}

type Prepared = { fileName: string; kind: SheetKind; rows: Record<string, Cell>[]; report: BatchReport; note?: string };

export function ImportView() {
  const service = useAdminService();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<SheetKind>("catalog");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const tab = TABS.find((t) => t.kind === kind) ?? TABS[0]!;

  function reset() {
    setPrepared(null);
    setError(null);
    setDone(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function run(k: SheetKind, rows: Record<string, Cell>[], dryRun: boolean, fileName: string): Promise<BatchReport> {
    // Las filas son crudas (string | number | null): el servidor es la autoridad de la validación.
    const options = { dryRun, fileName };
    if (k === "catalog") return service.importCatalog({ rows: rows as unknown as CatalogRow[], ...options });
    if (k === "prices") return service.importPrices({ rows: rows as unknown as PriceRow[], ...options });
    return service.importStock({ rows: rows as unknown as StockRow[], ...options });
  }

  async function onFile(file: File | undefined) {
    reset();
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parseSpreadsheet(file, kind);
      if (!parsed.ok) return void setError(parsed.message);
      const report = await run(kind, parsed.rows, true, file.name);
      setPrepared({
        fileName: file.name,
        kind,
        rows: parsed.rows,
        report,
        note: parsed.usedFallbackSheet ? `No hay una hoja llamada ARTICULO: se leyó «${parsed.sheetName}».` : undefined,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!prepared) return;
    setBusy(true);
    setError(null);
    try {
      const report = await run(prepared.kind, prepared.rows, false, prepared.fileName);
      setDone(
        sim(`Aplicado (simulado): ${report.created} creados, ${report.updated} actualizados, ${report.unchanged} sin cambios, ${report.skipped} omitidos. Nada se guardó fuera de esta pestaña.`),
      );
      setPrepared(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const report = prepared?.report;

  return (
    <div className={ui.page}>
      <div>
        <h1>Importar Excel</h1>
        <p className={ui.lead}>
          El archivo se lee en tu navegador y no se sube a ningún lado. Primero ves una vista previa; recién después aplicas los cambios.
        </p>
      </div>

      <div role="group" aria-label="Tipo de planilla">
        <ul className={ui.tabs}>
          {TABS.map((t) => (
            <li key={t.kind}>
              <button
                type="button"
                className={ui.tab}
                aria-pressed={kind === t.kind}
                onClick={() => {
                  setKind(t.kind);
                  reset();
                }}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <section className={`${ui.card} ${ui.section}`} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{tab.label}</h2>
        <p>{tab.help}</p>
        <p className={ui.help}>
          Columnas esperadas (en la primera fila): <span className={ui.mono}>{tab.columns}</span>. Se buscan sin distinguir mayúsculas.
        </p>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-file`}>
            Archivo (.xls, .xlsx o .csv, hasta 5 MiB)
          </label>
          <input
            ref={inputRef}
            id={`${id}-file`}
            type="file"
            className={ui.input}
            accept=".xls,.xlsx,.csv"
            disabled={busy}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      </section>

      <div aria-live="polite">
        {busy ? <p className={ui.alert}>Procesando…</p> : null}
        {error ? (
          <p className={`${ui.alert} ${ui.alertError}`} role="alert">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className={`${ui.alert} ${ui.alertOk}`} role="status">
            {done}
          </p>
        ) : null}
      </div>

      {prepared && report ? (
        <section className={ui.section} aria-labelledby={`${id}-preview`}>
          <h2 id={`${id}-preview`}>Vista previa de «{prepared.fileName}»</h2>
          {prepared.note ? <p className={`${ui.alert} ${ui.alertWarn}`}>{prepared.note}</p> : null}
          <ul className={ui.cards} aria-label="Resumen de la importación">
            <li className={ui.card}>
              <p className={ui.cardLabel}>Filas leídas</p>
              <p className={ui.cardValue}>{report.rows}</p>
            </li>
            <li className={ui.card}>
              <p className={ui.cardLabel}>Se crearían</p>
              <p className={ui.cardValue}>{report.created}</p>
            </li>
            <li className={ui.card}>
              <p className={ui.cardLabel}>Se actualizarían</p>
              <p className={ui.cardValue}>{report.updated}</p>
            </li>
            <li className={ui.card}>
              <p className={ui.cardLabel}>Sin cambios</p>
              <p className={ui.cardValue}>{report.unchanged}</p>
            </li>
            <li className={ui.card}>
              <p className={ui.cardLabel}>Inválidas</p>
              <p className={ui.cardValue}>{report.invalid.length}</p>
            </li>
          </ul>
          {report.truncated ? <p className={`${ui.alert} ${ui.alertWarn}`}>Las listas se recortaron a 500 entradas.</p> : null}

          <h3>Cambios válidos (antes → después)</h3>
          {report.changes.length === 0 ? (
            <p className={ui.empty}>No hay cambios para aplicar.</p>
          ) : (
            <div className={ui.tableWrap} role="region" aria-label="Cambios válidos" tabIndex={0}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Fila</th>
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
                      <td>{c.row}</td>
                      <td className={ui.mono}>{c.sku}</td>
                      <td>{c.name}</td>
                      <td>{FIELD_LABEL[c.field]}</td>
                      <td className={ui.num}>{formatCell(c, c.from)}</td>
                      <td className={ui.num}>{formatCell(c, c.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Filas inválidas (se omiten)</h3>
          {report.invalid.length === 0 ? (
            <p className={`${ui.alert} ${ui.alertOk}`}>Todas las filas son válidas.</p>
          ) : (
            <div className={ui.tableWrap} role="region" aria-label="Filas inválidas" tabIndex={0}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Fila</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Código</th>
                    <th scope="col">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.invalid.map((r) => (
                    <tr key={`${r.row}-${r.code}`} className={ui.rowInvalid}>
                      <td>{r.row}</td>
                      <td className={ui.mono}>{r.sku ?? "—"}</td>
                      <td>
                        <span className={`${ui.badge} ${ui.badgeDanger}`}>{r.code}</span>
                      </td>
                      <td>{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.corrected.length > 0 ? (
            <>
              <h3>Valores corregidos</h3>
              <ul>
                {report.corrected.map((c) => (
                  <li key={`${c.row}-${c.field}`}>
                    Fila {c.row}, SKU {c.sku}: {c.field} {String(c.from ?? "vacío")} → {String(c.to)}.
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {report.warnings.length > 0 ? (
            <>
              <h3>Advertencias</h3>
              <ul>
                {report.warnings.map((w, i) => (
                  <li key={`${w.code}-${w.sku ?? i}-${i}`}>
                    {w.sku ? `SKU ${w.sku}: ` : ""}
                    {w.code} — {w.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className={ui.actions}>
            <button type="button" className={ui.btn} onClick={() => void apply()} disabled={busy || (report.created === 0 && report.updated === 0)}>
              {sim("Aplicar (simulado)")}
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={reset} disabled={busy}>
              Descartar
            </button>
          </div>
          <p className={ui.help}>{sim("Las filas válidas se aplican y las inválidas se omiten. Es una simulación: nada se guarda al recargar.")}</p>
        </section>
      ) : null}
    </div>
  );
}
