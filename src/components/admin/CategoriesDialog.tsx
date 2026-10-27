"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { MAX_CATEGORY_NAME } from "@/lib/admin/categories";
import { errorMessage } from "@/lib/admin/errors";
import { sim } from "@/lib/admin/mode";
import type { AdminCategory } from "@/lib/admin/types";
import { slugify } from "@/lib/slug";
import { AdminDialog } from "./AdminDialog";
import { useAdminService, useAdminState } from "./AdminProvider";
import ui from "./admin.module.css";

type Notice = { kind: "ok" | "error"; text: string } | null;

function NoticeBox({ notice }: { notice: Notice }) {
  return (
    <div aria-live="polite">
      {notice ? (
        <p className={`${ui.alert} ${notice.kind === "ok" ? ui.alertOk : ui.alertError}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}

// Mantenedor de categorías (D-040) en un modal de Productos: crear, renombrar y eliminar. Son opcionales en los productos.
export function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const { categories, products } = useAdminState();
  const [notice, setNotice] = useState<Notice>(null);
  // Productos vigentes por categoría (los eliminados no cuentan).
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) if (p.categoryId && p.deletedAt === null) map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + 1);
    return map;
  }, [products]);

  return (
    <AdminDialog
      title="Categorías"
      description="La categoría de un producto es opcional. Al eliminar una categoría, sus productos quedan sin categoría (no se eliminan ni se despublican)."
      onClose={onClose}
      wide
    >
      <NewCategoryForm onNotice={setNotice} />
      <NoticeBox notice={notice} />
      <section aria-labelledby="cat-list-title">
        <h3 id="cat-list-title">Categorías existentes</h3>
        {categories.length === 0 ? (
          <p className={ui.empty}>Aún no hay categorías.</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Productos</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <CategoryRow key={c.slug} category={c} count={counts.get(c.slug) ?? 0} onNotice={setNotice} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminDialog>
  );
}

function NewCategoryForm({ onNotice }: { onNotice: (n: Notice) => void }) {
  const service = useAdminService();
  const id = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const slug = slugify(name, 60);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    onNotice(null);
    setBusy(true);
    try {
      await service.createCategory({ name });
      onNotice({ kind: "ok", text: sim(`Categoría «${name.trim()}» creada (simulado).`) });
      setName("");
    } catch (error) {
      onNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={ui.form} onSubmit={onSubmit} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Nueva categoría</h3>
      <div className={ui.fields}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-name`}>
            Nombre
          </label>
          <input
            id={`${id}-name`}
            className={ui.input}
            value={name}
            maxLength={MAX_CATEGORY_NAME}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      <div className={ui.actions}>
        <button type="submit" className={ui.btn} disabled={busy || slug === ""}>
          {busy ? "Creando…" : "Crear categoría"}
        </button>
      </div>
    </form>
  );
}

function CategoryRow({ category, count, onNotice }: { category: AdminCategory; count: number; onNotice: (n: Notice) => void }) {
  const service = useAdminService();
  const id = useId();
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);

  async function rename(event: FormEvent) {
    event.preventDefault();
    onNotice(null);
    setBusy(true);
    try {
      await service.updateCategory(category.slug, { name });
      onNotice({ kind: "ok", text: sim(`Categoría renombrada a «${name.trim()}» (simulado).`) });
      setMode("view");
    } catch (error) {
      onNotice({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    onNotice(null);
    setBusy(true);
    try {
      const { productsUpdated } = await service.deleteCategory(category.slug);
      onNotice({
        kind: "ok",
        text: sim(`Categoría «${category.name}» eliminada (simulado).`) + (productsUpdated > 0 ? ` ${productsUpdated} productos quedaron sin categoría.` : ""),
      });
    } catch (error) {
      onNotice({ kind: "error", text: errorMessage(error) });
      setBusy(false);
      setMode("view");
    }
  }

  return (
    <tr>
      <td>
        {mode === "edit" ? (
          <form id={`${id}-form`} onSubmit={rename}>
            <label className="visually-hidden" htmlFor={`${id}-name`}>
              Nombre de la categoría
            </label>
            <input
              id={`${id}-name`}
              className={ui.input}
              value={name}
              maxLength={MAX_CATEGORY_NAME}
              required
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </form>
        ) : (
          category.name
        )}
      </td>
      <td>{count}</td>
      <td>
        <div className={ui.actions}>
          {mode === "view" ? (
            <>
              <button type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={() => setMode("edit")}>
                Renombrar
              </button>
              <button type="button" className={`${ui.btn} ${ui.btnDangerOutline}`} onClick={() => setMode("confirmDelete")}>
                Eliminar
              </button>
            </>
          ) : null}
          {mode === "edit" ? (
            <>
              <button type="submit" form={`${id}-form`} className={ui.btn} disabled={busy}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnOutline}`}
                disabled={busy}
                onClick={() => {
                  setName(category.name);
                  setMode("view");
                }}
              >
                Cancelar
              </button>
            </>
          ) : null}
          {mode === "confirmDelete" ? (
            <>
              <span role="status">{count > 0 ? `¿Eliminar? ${count} productos quedarán sin categoría.` : "¿Eliminar?"}</span>
              <button type="button" className={`${ui.btn} ${ui.btnDangerOutline}`} disabled={busy} onClick={() => void remove()}>
                {busy ? "Eliminando…" : "Sí, eliminar"}
              </button>
              <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={() => setMode("view")}>
                Cancelar
              </button>
            </>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
