"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { categoryName } from "@/lib/admin/categories";
import { errorMessage } from "@/lib/admin/errors";
import { selectionState, toggleAllVisible, visibleSelection } from "@/lib/admin/selection";
import { MAX_DELETE_SKUS } from "@/lib/admin/batch";
import { formatClp } from "@/lib/format";
import { useAdminService, useAdminState, useDataSource } from "./AdminProvider";
import { CategoriesDialog } from "./CategoriesDialog";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { ImportExcelDialog } from "./ImportExcelDialog";
import { formatDate } from "./format";
import ui from "./admin.module.css";
import { sim } from "@/lib/admin/mode";

type PublishFilter = "all" | "published" | "draft" | "inactive" | "deleted";
type StockFilter = "all" | "with" | "without";
type CommissionFilter = "all" | "with" | "without";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ProductsView() {
  const { products, categories } = useAdminState();
  const service = useAdminService();
  const canToggleActive = useDataSource() === "demo";
  const id = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [publish, setPublish] = useState<PublishFilter>("all");
  const [stock, setStock] = useState<StockFilter>("all");
  // El Resumen enlaza aquí con ?comision=sin para completar las comisiones pendientes.
  const [commission, setCommission] = useState<CommissionFilter>(useSearchParams().get("comision") === "sin" ? "without" : "all");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const headerCheckRef = useRef<HTMLInputElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const categoriesButtonRef = useRef<HTMLButtonElement>(null);
  const [showCategories, setShowCategories] = useState(false);
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const [showImport, setShowImport] = useState(false);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const showingDeleted = publish === "deleted";

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return products
      .filter((p) => {
        // Por defecto no se ven los eliminados; el filtro "Eliminados" muestra solo esos (D-029).
        if (showingDeleted !== (p.deletedAt !== null)) return false;
        if (q && !normalize(p.name).includes(q) && !p.sku.toLowerCase().includes(q)) return false;
        if (category === "none" ? p.categoryId !== null : category !== "all" && p.categoryId !== category) return false;
        if (publish === "published" && !(p.published && p.active)) return false;
        if (publish === "draft" && !(!p.published && p.active)) return false;
        if (publish === "inactive" && p.active) return false;
        if (stock === "with" && p.stock <= 0) return false;
        if (stock === "without" && p.stock > 0) return false;
        if (commission === "with" && p.commissionPerUnit === null) return false;
        if (commission === "without" && p.commissionPerUnit !== null) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [products, query, category, publish, stock, commission, showingDeleted]);

  const visibleSkus = useMemo(() => filtered.map((p) => p.sku), [filtered]);
  // Solo cuenta lo que se ve: una selección oculta por un filtro nunca se opera.
  const selectedSkus = useMemo(() => visibleSelection(selected, visibleSkus), [selected, visibleSkus]);
  const headerState = selectionState(selected, visibleSkus);
  const activeCount = useMemo(() => products.filter((p) => p.deletedAt === null).length, [products]);
  const deletedCount = products.length - activeCount;

  useEffect(() => {
    if (headerCheckRef.current) headerCheckRef.current.indeterminate = headerState === "some";
  }, [headerState]);

  function toggleOne(sku: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(sku);
    else next.delete(sku);
    setSelected(next);
  }

  function tooMany(): boolean {
    if (selectedSkus.length <= MAX_DELETE_SKUS) return false;
    setMessage({ kind: "error", text: `Máximo ${MAX_DELETE_SKUS} productos por operación (TOO_MANY_ROWS). Tienes ${selectedSkus.length} seleccionados: reduce la selección.` });
    return true;
  }

  function openConfirm() {
    setMessage(null);
    setDialogError(null);
    if (tooMany()) return;
    setConfirming(true);
  }

  function closeConfirm() {
    setConfirming(false);
    setDialogError(null);
    // El foco vuelve al botón que abrió el diálogo.
    requestAnimationFrame(() => deleteButtonRef.current?.focus());
  }

  async function confirmDelete() {
    setBusy(true);
    setDialogError(null);
    try {
      const report = await service.deleteProducts({ skus: selectedSkus });
      setConfirming(false);
      setSelected(new Set());
      const omitted = report.skipped > 0 ? ` Se omitieron ${report.skipped} (${[...new Set(report.invalid.map((r) => r.code))].join(", ")}).` : "";
      setMessage({
        kind: "ok",
        text: sim(`${report.deleted} ${report.deleted === 1 ? "producto eliminado" : "productos eliminados"} (simulado). Puedes restaurarlos desde el filtro «Eliminados».${omitted}`),
      });
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      setDialogError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function restoreSelected() {
    setMessage(null);
    if (tooMany()) return;
    setBusy(true);
    try {
      const report = await service.restoreProducts({ skus: selectedSkus });
      setSelected(new Set());
      const omitted = report.skipped > 0 ? ` Se omitieron ${report.skipped} (${[...new Set(report.invalid.map((r) => r.code))].join(", ")}).` : "";
      setMessage({
        kind: "ok",
        text: sim(`${report.restored} ${report.restored === 1 ? "producto restaurado" : "productos restaurados"} (simulado). Quedan sin publicar.${omitted}`),
      });
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (error) {
      setMessage({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(sku: string, published: boolean) {
    setMessage(null);
    try {
      const report = await service.setProductsPublished({ skus: [sku], published });
      const bad = report.invalid[0];
      if (bad) setMessage({ kind: "error", text: `No se pudo publicar (${bad.code}): ${bad.message} Completa los datos en la ficha del producto.` });
      else setMessage({ kind: "ok", text: published ? sim("Producto publicado (simulado).") : sim("Producto despublicado (simulado).") });
    } catch (error) {
      setMessage({ kind: "error", text: errorMessage(error) });
    }
  }

  async function toggleActive(sku: string, active: boolean) {
    setMessage(null);
    try {
      await service.setProductActive(sku, active);
      setMessage({ kind: "ok", text: active ? sim("Producto activado (simulado).") : sim("Producto desactivado y despublicado (simulado). Los productos no se borran.") });
    } catch (error) {
      setMessage({ kind: "error", text: errorMessage(error) });
    }
  }

  return (
    <div className={ui.page}>
      <div className={ui.pageHeader}>
        <div>
          <h1>Productos</h1>
          <p className={ui.lead}>
            {activeCount} productos{deletedCount > 0 ? ` y ${deletedCount} eliminados` : ""}. Elige varios con las casillas para eliminarlos; se conservan para los pedidos y se pueden restaurar.
          </p>
        </div>
        <div className={ui.actions}>
          <button ref={categoriesButtonRef} type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={() => setShowCategories(true)}>
            Categorías
          </button>
          <button ref={importButtonRef} type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={() => setShowImport(true)}>
            Importar Excel
          </button>
          <Link href="/admin/productos/nuevo" className={ui.btn}>
            Nuevo producto
          </Link>
        </div>
      </div>

      <form className={`${ui.toolbar} ${ui.toolbarWide}`} role="search" aria-label="Buscar y filtrar productos" onSubmit={(e) => e.preventDefault()}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-q`}>
            Buscar por nombre o SKU
          </label>
          <input id={`${id}-q`} type="search" className={ui.input} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-cat`}>
            Categoría
          </label>
          <select id={`${id}-cat`} className={ui.select} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Todas</option>
            <option value="none">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-pub`}>
            Estado
          </label>
          <select id={`${id}-pub`} className={ui.select} value={publish} onChange={(e) => setPublish(e.target.value as PublishFilter)}>
            <option value="all">Todos</option>
            <option value="published">Publicados</option>
            <option value="draft">Sin publicar</option>
            <option value="inactive">Desactivados</option>
            <option value="deleted">Eliminados</option>
          </select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-stock`}>
            Stock
          </label>
          <select id={`${id}-stock`} className={ui.select} value={stock} onChange={(e) => setStock(e.target.value as StockFilter)}>
            <option value="all">Todos</option>
            <option value="with">Con stock</option>
            <option value="without">Sin stock</option>
          </select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-commission`}>
            Comisión
          </label>
          <select id={`${id}-commission`} className={ui.select} value={commission} onChange={(e) => setCommission(e.target.value as CommissionFilter)}>
            <option value="all">Todas</option>
            <option value="with">Con comisión</option>
            <option value="without">Sin comisión</option>
          </select>
        </div>
      </form>

      <div aria-live="polite">
        {message ? (
          <p className={`${ui.alert} ${message.kind === "ok" ? ui.alertOk : ui.alertError}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}
      </div>

      <p className={ui.help} role="status" ref={resultRef} tabIndex={-1}>
        {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
      </p>

      {confirming ? (
        <ConfirmDeleteDialog
          names={filtered.filter((p) => selected.has(p.sku)).map((p) => p.name)}
          busy={busy}
          error={dialogError}
          onConfirm={() => void confirmDelete()}
          onCancel={closeConfirm}
        />
      ) : null}

      {filtered.length === 0 ? (
        <p className={ui.empty}>{showingDeleted ? "No hay productos eliminados." : "No hay productos que coincidan con la búsqueda."}</p>
      ) : (
        <div className={ui.tableWrap} role="region" aria-label="Tabla de productos" tabIndex={0}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col" className={ui.checkCell}>
                  <label className={ui.checkTarget}>
                    <input
                      ref={headerCheckRef}
                      type="checkbox"
                      checked={headerState === "all"}
                      onChange={(e) => setSelected(toggleAllVisible(selected, visibleSkus, e.target.checked))}
                    />
                    <span className="visually-hidden">Seleccionar todos los productos de la lista filtrada ({filtered.length})</span>
                  </label>
                </th>
                <th scope="col">Producto</th>
                <th scope="col">Categoría</th>
                <th scope="col" className={ui.num}>
                  Precio
                </th>
                <th scope="col" className={ui.num}>
                  Stock
                </th>
                <th scope="col" className={ui.num}>
                  Comisión
                </th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.sku}>
                  <td className={ui.checkCell}>
                    <label className={ui.checkTarget}>
                      <input type="checkbox" checked={selected.has(p.sku)} onChange={(e) => toggleOne(p.sku, e.target.checked)} />
                      <span className="visually-hidden">Seleccionar {p.name}</span>
                    </label>
                  </td>
                  <td>
                    <Link className={ui.linkCell} href={`/admin/productos/${encodeURIComponent(p.sku)}`}>
                      {p.name}
                    </Link>
                    <br />
                    <span className={ui.help}>SKU {p.sku}</span>
                  </td>
                  <td>{p.categoryId ? categoryName(categories, p.categoryId) : <span className={ui.help}>Sin categoría</span>}</td>
                  <td className={ui.num}>
                    {formatClp(p.finalPrice)}
                    {p.finalPrice < p.price ? (
                      <>
                        <br />
                        <s className={ui.help}>{formatClp(p.price)}</s>
                      </>
                    ) : null}
                  </td>
                  <td className={ui.num}>{p.stock}</td>
                  <td className={ui.num}>{p.commissionPerUnit === null ? <span className={ui.help}>—</span> : formatClp(p.commissionPerUnit)}</td>
                  <td>
                    {p.deletedAt ? (
                      <>
                        <span className={`${ui.badge} ${ui.badgeDanger}`}>Eliminado</span>
                        <br />
                        <span className={ui.help}>{formatDate(p.deletedAt)}</span>
                      </>
                    ) : !p.active ? (
                      <span className={`${ui.badge} ${ui.badgeDanger}`}>Desactivado</span>
                    ) : p.published ? (
                      <span className={`${ui.badge} ${ui.badgeOk}`}>Publicado</span>
                    ) : (
                      <span className={`${ui.badge} ${ui.badgeWarn}`}>Sin publicar</span>
                    )}
                    {p.stock === 0 ? (
                      <>
                        {" "}
                        <span className={`${ui.badge} ${ui.badgeDanger}`}>Sin stock</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <div className={ui.actions}>
                      <Link className={`${ui.btn} ${ui.btnOutline}`} href={`/admin/productos/${encodeURIComponent(p.sku)}`} aria-label={`Editar ${p.name}`}>
                        Editar
                      </Link>
                      {p.deletedAt ? null : p.active ? (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnOutline}`}
                          onClick={() => togglePublished(p.sku, !p.published)}
                          aria-label={`${p.published ? "Despublicar" : "Publicar"} ${p.name}`}
                        >
                          {p.published ? "Despublicar" : "Publicar"}
                        </button>
                      ) : null}
                      {p.deletedAt || !canToggleActive ? null : (
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnDangerOutline}`}
                          onClick={() => toggleActive(p.sku, !p.active)}
                          aria-label={`${p.active ? "Desactivar" : "Activar"} ${p.name}`}
                        >
                          {p.active ? "Desactivar" : "Activar"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Va después de la tabla: al ser sticky abajo queda siempre a la vista mientras haya selección. */}
      <div aria-live="polite" role="region" aria-label="Acciones sobre la selección" className={selectedSkus.length > 0 ? ui.selectionBar : undefined}>
        {selectedSkus.length > 0 ? (
          <>
            <p>
              {selectedSkus.length} {selectedSkus.length === 1 ? "seleccionado" : "seleccionados"}
            </p>
            {showingDeleted ? (
              <button type="button" className={ui.btn} disabled={busy} onClick={() => void restoreSelected()}>
                Restaurar seleccionados
              </button>
            ) : (
              <button type="button" ref={deleteButtonRef} className={`${ui.btn} ${ui.btnDanger}`} disabled={busy} onClick={openConfirm}>
                Eliminar seleccionados
              </button>
            )}
            <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={() => setSelected(new Set())}>
              Limpiar selección
            </button>
          </>
        ) : null}
      </div>
      {showCategories ? (
        <CategoriesDialog
          onClose={() => {
            setShowCategories(false);
            categoriesButtonRef.current?.focus();
          }}
        />
      ) : null}
      {showImport ? (
        <ImportExcelDialog
          onClose={() => {
            setShowImport(false);
            importButtonRef.current?.focus();
          }}
          onApplied={(text) => {
            setShowImport(false);
            setMessage({ kind: "ok", text });
            requestAnimationFrame(() => resultRef.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
}
