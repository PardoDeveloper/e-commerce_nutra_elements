"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MAX_DISCOUNT_SKUS } from "@/lib/admin/batch";
import { errorMessage } from "@/lib/admin/errors";
import { selectionState, toggleAllVisible } from "@/lib/admin/selection";
import type { BatchReport, ProductDiscount } from "@/lib/admin/types";
import { formatClp } from "@/lib/format";
import { useAdminService, useAdminState } from "./AdminProvider";
import ui from "./admin.module.css";
import { sim } from "@/lib/admin/mode";

type Mode = "selection" | "category" | "skus";
type Kind = "percent" | "fixed" | "remove";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function describe(d: ProductDiscount): string {
  return d.type === "percent" ? `${d.value}%` : formatClp(d.value);
}

export function DiscountsView() {
  const { products: allProducts, categories } = useAdminState();
  const service = useAdminService();
  const id = useId();
  // Los productos eliminados no se ofrecen (D-029).
  const products = useMemo(() => allProducts.filter((p) => p.deletedAt === null), [allProducts]);
  const [mode, setMode] = useState<Mode>("selection");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState("");
  const [chosenCategory, setCategory] = useState<string | null>(null);
  // Sin elección, la primera categoría (las categorías se cargan después en Firebase y pueden cambiar).
  const category = chosenCategory !== null && categories.some((c) => c.slug === chosenCategory) ? chosenCategory : (categories[0]?.slug ?? "");
  const [skuText, setSkuText] = useState("");
  const [kind, setKind] = useState<Kind>("percent");
  const [value, setValue] = useState("10");
  const [preview, setPreview] = useState<{ report: BatchReport; skus: string[]; discount: ProductDiscount | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = normalize(search.trim());
    return products.filter((p) => !q || normalize(p.name).includes(q) || p.sku.toLowerCase().includes(q));
  }, [products, search]);
  const discounted = useMemo(() => products.filter((p) => p.discount !== null), [products]);
  const visibleSkus = useMemo(() => visible.map((p) => p.sku), [visible]);
  const headerState = selectionState(selected, visibleSkus);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (headerCheckRef.current) headerCheckRef.current.indeterminate = headerState === "some";
  }, [headerState]);

  function toggleAll(on: boolean) {
    clearPreview();
    setSelected(toggleAllVisible(selected, visibleSkus, on));
  }

  function clearPreview() {
    setPreview(null);
    setError(null);
    setDone(null);
  }

  function targetSkus(): string[] {
    if (mode === "selection") return [...selected];
    if (mode === "category") return products.filter((p) => p.categoryId === category).map((p) => p.sku);
    return skuText.split(/[\s,;]+/).filter(Boolean);
  }

  function currentDiscount(): ProductDiscount | null | "invalid" {
    if (kind === "remove") return null;
    const n = Number(value);
    if (value.trim() === "" || !Number.isInteger(n)) return "invalid";
    return { type: kind, value: n };
  }

  async function runPreview() {
    clearPreview();
    const discount = currentDiscount();
    if (discount === "invalid") return void setError("El valor del descuento debe ser un número entero.");
    const skus = targetSkus();
    try {
      const report = await service.applyDiscount({ skus, discount, dryRun: true });
      setPreview({ report, skus, discount });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function apply() {
    if (!preview) return;
    try {
      const report = await service.applyDiscount({ skus: preview.skus, discount: preview.discount });
      setDone(sim(`Aplicado (simulado): ${report.updated} actualizados, ${report.unchanged} sin cambios, ${report.skipped} omitidos.`));
      setPreview(null);
      setSelected(new Set());
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function removeOne(sku: string) {
    clearPreview();
    try {
      await service.applyDiscount({ skus: [sku], discount: null });
      setDone(sim(`Descuento quitado del SKU ${sku} (simulado).`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function toggle(sku: string, on: boolean) {
    clearPreview();
    const next = new Set(selected);
    if (on) next.add(sku);
    else next.delete(sku);
    setSelected(next);
  }

  const count = targetSkus().length;

  return (
    <div className={ui.page}>
      <div>
        <h1>Descuentos</h1>
        <p className={ui.lead}>
          Un producto tiene como máximo un descuento (porcentaje o monto fijo); uno nuevo reemplaza al anterior. Hasta 150 productos por operación.
        </p>
      </div>

      <section className={`${ui.card} ${ui.form}`} aria-labelledby={`${id}-form`}>
        <h2 id={`${id}-form`}>Aplicar o quitar descuento</h2>

        <div role="group" aria-label="A quién se aplica">
          <ul className={ui.tabs}>
            {(
              [
                ["selection", "Productos seleccionados"],
                ["category", "Una categoría"],
                ["skus", "Lista de SKU"],
              ] as const
            ).map(([m, label]) => (
              <li key={m}>
                <button
                  type="button"
                  className={ui.tab}
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    clearPreview();
                  }}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {mode === "selection" ? (
          <div className={ui.section}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-search`}>
                Buscar producto
              </label>
              <input id={`${id}-search`} type="search" className={ui.input} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className={ui.selectionInfo} role="status">
              <span>
                {selected.size === 0
                  ? "Ningún producto seleccionado"
                  : selected.size === 1
                    ? "1 producto seleccionado"
                    : `${selected.size} productos seleccionados`}
              </span>
              {visible.length > 0 && headerState !== "all" ? (
                <button type="button" className={ui.linkButton} onClick={() => toggleAll(true)}>
                  {search.trim() ? `Seleccionar los ${visible.length} encontrados` : `Seleccionar todos (${visible.length})`}
                </button>
              ) : null}
              {selected.size > 0 ? (
                <button
                  type="button"
                  className={ui.linkButton}
                  onClick={() => {
                    clearPreview();
                    setSelected(new Set());
                  }}
                >
                  Quitar selección
                </button>
              ) : null}
            </div>
            {selected.size > MAX_DISCOUNT_SKUS ? (
              <p className={`${ui.alert} ${ui.alertWarn}`}>
                Hay {selected.size} seleccionados y el máximo por operación es {MAX_DISCOUNT_SKUS}. Aplica el descuento en partes o usa «Por categoría».
              </p>
            ) : null}
            <div className={ui.scroll} role="region" aria-label="Productos para seleccionar" tabIndex={0}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col" className={ui.checkCell}>
                      <label className={ui.checkTarget}>
                        <input
                          ref={headerCheckRef}
                          type="checkbox"
                          className={ui.checkbox}
                          checked={headerState === "all"}
                          disabled={visible.length === 0}
                          onChange={(e) => toggleAll(e.target.checked)}
                        />
                        <span className="visually-hidden">Seleccionar todos los productos de la lista ({visible.length})</span>
                      </label>
                    </th>
                    <th scope="col">Producto</th>
                    <th scope="col" className={ui.num}>
                      Precio final
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.sku}>
                      <td>
                        <input
                          type="checkbox"
                          id={`${id}-p-${p.sku}`}
                          checked={selected.has(p.sku)}
                          onChange={(e) => toggle(p.sku, e.target.checked)}
                          className={ui.checkbox}
                        />
                      </td>
                      <td>
                        <label htmlFor={`${id}-p-${p.sku}`}>{p.name}</label>
                        <br />
                        <span className={ui.help}>SKU {p.sku}</span>
                      </td>
                      <td className={ui.num}>
                        {formatClp(p.finalPrice)}
                        {p.discount ? <span className={ui.help}> (−{describe(p.discount)})</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {mode === "category" ? (
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-cat`}>
              Categoría
            </label>
            <select
              id={`${id}-cat`}
              className={ui.select}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                clearPreview();
              }}
            >
              {categories.length === 0 ? <option value="">No hay categorías</option> : null}
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {mode === "skus" ? (
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-skus`}>
              SKU (separados por coma, espacio o salto de línea)
            </label>
            <textarea
              id={`${id}-skus`}
              className={ui.textarea}
              value={skuText}
              onChange={(e) => {
                setSkuText(e.target.value);
                clearPreview();
              }}
            />
          </div>
        ) : null}

        <div className={ui.fields}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-kind`}>
              Tipo
            </label>
            <select
              id={`${id}-kind`}
              className={ui.select}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind);
                clearPreview();
              }}
            >
              <option value="percent">Porcentaje (1 a 99)</option>
              <option value="fixed">Monto fijo en CLP</option>
              <option value="remove">Quitar el descuento</option>
            </select>
          </div>
          {kind !== "remove" ? (
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`${id}-value`}>
                {kind === "percent" ? "Porcentaje" : "Monto (CLP)"}
              </label>
              <input
                id={`${id}-value`}
                className={ui.input}
                inputMode="numeric"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  clearPreview();
                }}
              />
              <span className={ui.help}>
                {kind === "fixed" ? "Debe ser menor que el precio de cada producto." : "Redondeo al entero más cercano."}
              </span>
            </div>
          ) : null}
        </div>

        <div className={ui.actions}>
          <button type="button" className={ui.btn} onClick={() => void runPreview()}>
            Vista previa ({count} {count === 1 ? "producto" : "productos"})
          </button>
        </div>

        <div aria-live="polite">
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

        {preview ? (
          <div className={ui.section}>
            <h3>Vista previa</h3>
            {preview.report.changes.length === 0 ? (
              <p className={ui.empty}>No hay cambios para aplicar.</p>
            ) : (
              <div className={ui.tableWrap} role="region" aria-label="Vista previa de precios" tabIndex={0}>
                <table className={ui.table}>
                  <thead>
                    <tr>
                      <th scope="col">SKU</th>
                      <th scope="col">Producto</th>
                      <th scope="col" className={ui.num}>
                        Precio actual
                      </th>
                      <th scope="col" className={ui.num}>
                        Precio nuevo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.report.changes.map((c) => (
                      <tr key={c.sku}>
                        <td className={ui.mono}>{c.sku}</td>
                        <td>{c.name}</td>
                        <td className={ui.num}>{formatClp(Number(c.from))}</td>
                        <td className={ui.num}>{formatClp(Number(c.to))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.report.invalid.length > 0 ? (
              <div className={ui.tableWrap} role="region" aria-label="Productos omitidos" tabIndex={0}>
                <table className={ui.table}>
                  <caption>Se omiten {preview.report.invalid.length} productos</caption>
                  <thead>
                    <tr>
                      <th scope="col">SKU</th>
                      <th scope="col">Código</th>
                      <th scope="col">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.report.invalid.map((r) => (
                      <tr key={`${r.row}-${r.code}`} className={ui.rowInvalid}>
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
            ) : null}
            <div className={ui.actions}>
              <button type="button" className={ui.btn} onClick={() => void apply()} disabled={preview.report.updated === 0}>
                {preview.discount ? sim("Aplicar descuento (simulado)") : sim("Quitar descuento (simulado)")}
              </button>
              <button type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={clearPreview}>
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className={ui.section} aria-labelledby={`${id}-current`}>
        <h2 id={`${id}-current`}>Productos con descuento</h2>
        {discounted.length === 0 ? (
          <p className={ui.empty}>Ningún producto tiene descuento.</p>
        ) : (
          <div className={ui.tableWrap} role="region" aria-label="Productos con descuento" tabIndex={0}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Descuento</th>
                  <th scope="col" className={ui.num}>
                    Lista
                  </th>
                  <th scope="col" className={ui.num}>
                    Final
                  </th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {discounted.map((p) => (
                  <tr key={p.sku}>
                    <td>
                      {p.name}
                      <br />
                      <span className={ui.help}>SKU {p.sku}</span>
                    </td>
                    <td>{p.discount ? describe(p.discount) : "—"}</td>
                    <td className={ui.num}>{formatClp(p.price)}</td>
                    <td className={ui.num}>{formatClp(p.finalPrice)}</td>
                    <td>
                      <button type="button" className={`${ui.btn} ${ui.btnDangerOutline}`} onClick={() => void removeOne(p.sku)} aria-label={`Quitar el descuento de ${p.name}`}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
