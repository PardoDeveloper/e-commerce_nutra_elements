"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/admin/errors";
import type { AdminProduct } from "@/lib/admin/types";
import { formatClp } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { useAdminService, useAdminState, useDataSource } from "./AdminProvider";
import { CategoriesDialog } from "./CategoriesDialog";
import { ImageManager } from "./ImageManager";
import { formatDate } from "./format";
import ui from "./admin.module.css";
import { sim } from "@/lib/admin/mode";
import { commissionToInput, parseCommissionInput } from "@/lib/admin/commission";

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

export function ProductEditor({ sku }: { sku: string }) {
  const { products } = useAdminState();
  const product = products.find((p) => p.sku === sku);

  if (!product) {
    return (
      <div className={ui.page}>
        <h1>Producto no encontrado</h1>
        <p className={ui.empty}>No existe un producto con el SKU «{sku}».</p>
        <Link href="/admin/productos" className={ui.btn}>
          Volver a productos
        </Link>
      </div>
    );
  }
  return <Editor key={product.sku} product={product} />;
}

function Editor({ product }: { product: AdminProduct }) {
  const service = useAdminService();
  // Con Firebase, «activo» viene de la planilla de Control Farma: no hay función para cambiarlo a mano.
  const canToggleActive = useDataSource() === "demo";
  const [statusNotice, setStatusNotice] = useState<Notice>(null);

  async function togglePublished() {
    setStatusNotice(null);
    try {
      const report = await service.setProductsPublished({ skus: [product.sku], published: !product.published });
      const bad = report.invalid[0];
      if (bad) setStatusNotice({ kind: "error", text: `No se pudo publicar (${bad.code}): ${bad.message}` });
      else setStatusNotice({ kind: "ok", text: product.published ? sim("Producto despublicado (simulado).") : sim("Producto publicado (simulado).") });
    } catch (error) {
      setStatusNotice({ kind: "error", text: errorMessage(error) });
    }
  }

  async function toggleActive() {
    setStatusNotice(null);
    try {
      await service.setProductActive(product.sku, !product.active);
      setStatusNotice({ kind: "ok", text: product.active ? sim("Producto desactivado y despublicado (simulado).") : sim("Producto activado (simulado).") });
    } catch (error) {
      setStatusNotice({ kind: "error", text: errorMessage(error) });
    }
  }

  async function restore() {
    setStatusNotice(null);
    try {
      const report = await service.restoreProducts({ skus: [product.sku] });
      const bad = report.invalid[0];
      if (bad) setStatusNotice({ kind: "error", text: `No se pudo restaurar (${bad.code}): ${bad.message}` });
      else setStatusNotice({ kind: "ok", text: sim("Producto restaurado (simulado). Quedó sin publicar.") });
    } catch (error) {
      setStatusNotice({ kind: "error", text: errorMessage(error) });
    }
  }

  if (product.deletedAt) {
    return (
      <div className={ui.page}>
        <nav aria-label="Ruta de navegación" className={ui.help}>
          <Link href="/admin/productos">Productos</Link> / {product.name}
        </nav>
        <div>
          <h1>{product.name}</h1>
          <p className={ui.lead}>SKU {product.sku}</p>
        </div>
        <div className={`${ui.alert} ${ui.alertError} ${ui.deletedNotice}`} role="status">
          <strong>Producto eliminado</strong>
          <span>
            Se eliminó el {formatDate(product.deletedAt)}. No se puede editar ni publicar, y la tienda no lo muestra. Restáuralo para volver a editarlo (quedará sin publicar).
          </span>
          <button type="button" className={ui.btn} onClick={() => void restore()}>
            Restaurar
          </button>
        </div>
        <NoticeBox notice={statusNotice} />
        <Link href="/admin/productos" className={`${ui.btn} ${ui.btnOutline}`}>
          Volver a productos
        </Link>
      </div>
    );
  }

  return (
    <div className={ui.page}>
      <nav aria-label="Ruta de navegación" className={ui.help}>
        <Link href="/admin/productos">Productos</Link> / {product.name}
      </nav>
      <div className={ui.pageHeader}>
        <div>
          <h1>{product.name}</h1>
          <p className={ui.lead}>
            SKU {product.sku} ·{" "}
            {!product.active ? (
              <span className={`${ui.badge} ${ui.badgeDanger}`}>Desactivado</span>
            ) : product.published ? (
              <span className={`${ui.badge} ${ui.badgeOk}`}>Publicado</span>
            ) : (
              <span className={`${ui.badge} ${ui.badgeWarn}`}>Sin publicar</span>
            )}
          </p>
        </div>
        <div className={ui.actions}>
          {product.active ? (
            <button type="button" className={ui.btn} onClick={() => void togglePublished()}>
              {product.published ? "Despublicar" : "Publicar"}
            </button>
          ) : null}
          {canToggleActive ? (
            <button type="button" className={`${ui.btn} ${ui.btnDangerOutline}`} onClick={() => void toggleActive()}>
              {product.active ? "Desactivar" : "Activar"}
            </button>
          ) : null}
        </div>
      </div>
      <NoticeBox notice={statusNotice} />

      <ContentForm product={product} />
      <CommerceForm product={product} />
      <ImageManager product={product} />
    </div>
  );
}

function ContentForm({ product }: { product: AdminProduct }) {
  const service = useAdminService();
  const { categories } = useAdminState();
  const id = useId();
  const [name, setName] = useState(product.name);
  const [categoryId, setCategoryId] = useState<string>(product.categoryId ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [format, setFormat] = useState(product.format ?? "");
  const [units, setUnits] = useState(product.unitsPerPack?.toString() ?? "");
  const [notice, setNotice] = useState<Notice>(null);
  const [showCategories, setShowCategories] = useState(false);
  const categoriesButtonRef = useRef<HTMLButtonElement>(null);
  // El slug sale del nombre; publicado no cambia (las reglas lo bloquean y la URL ya está indexada).
  const slug = product.published ? (product.slug ?? "") : slugify(name);
  const unknownCategory = categoryId !== "" && !categories.some((c) => c.slug === categoryId);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const unitsValue = units.trim() === "" ? null : Number(units);
    if (unitsValue !== null && (!Number.isInteger(unitsValue) || unitsValue < 1 || unitsValue > 1000)) {
      setNotice({ kind: "error", text: "La presentación debe ser un entero entre 1 y 1000." });
      return;
    }
    if (!product.published && slug === "") {
      setNotice({ kind: "error", text: "El nombre debe tener al menos una letra o un número para generar la URL." });
      return;
    }
    try {
      await service.updateProductContent(product.sku, {
        name,
        // El slug no se puede cambiar con el producto publicado: solo se envía si cambió.
        ...(!product.published && slug !== (product.slug ?? "") ? { slug } : {}),
        categoryId: categoryId === "" ? null : categoryId,
        description: description.trim() === "" ? null : description,
        format: format.trim() === "" ? null : format.trim(),
        unitsPerPack: unitsValue,
        // Título y descripción SEO salen del nombre y la descripción (D-040): se limpia lo que hubiera guardado.
        ...(product.seo !== null ? { seo: null } : {}),
      });
      setNotice({ kind: "ok", text: sim("Contenido guardado (simulado).") });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }

  return (
    <>
      <form className={`${ui.card} ${ui.form}`} onSubmit={onSubmit} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>Contenido</h2>
        <div className={ui.fields}>
          <div className={`${ui.field} ${ui.fieldFull}`}>
            <label className={ui.label} htmlFor={`${id}-name`}>
              Nombre
            </label>
            <input id={`${id}-name`} className={ui.input} value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} />
            <span className={ui.help}>Nombre original de la planilla: {product.sourceName}</span>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-slug`}>
              Slug (URL)
            </label>
            <input id={`${id}-slug`} className={ui.input} value={slug} readOnly aria-describedby={`${id}-slug-help`} />
            <span id={`${id}-slug-help`} className={ui.help}>
              {product.published ? "No se puede cambiar mientras el producto está publicado." : "Se genera solo a partir del nombre."}
            </span>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-cat`}>
              Categoría (opcional)
            </label>
            <select id={`${id}-cat`} className={ui.select} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
              {unknownCategory ? <option value={categoryId}>{categoryId} (no existe)</option> : null}
            </select>
            <button ref={categoriesButtonRef} type="button" className={`${ui.btn} ${ui.btnOutline}`} onClick={() => setShowCategories(true)}>
              Administrar categorías
            </button>
          </div>
          <div className={`${ui.field} ${ui.fieldFull}`}>
            <label className={ui.label} htmlFor={`${id}-desc`}>
              Descripción
            </label>
            <textarea id={`${id}-desc`} className={ui.textarea} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} />
            <span className={ui.help}>Texto plano. {description.length}/5000</span>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-format`}>
              Forma farmacéutica
            </label>
            <input id={`${id}-format`} className={ui.input} value={format} maxLength={40} onChange={(e) => setFormat(e.target.value)} placeholder="Cápsulas" />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-units`}>
              Presentación
            </label>
            <input id={`${id}-units`} className={ui.input} inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} aria-describedby={`${id}-units-help`} />
            <span id={`${id}-units-help`} className={ui.help}>
              Unidades por envase, por ejemplo 60.
            </span>
          </div>
        </div>
        <div className={ui.actions}>
          <button type="submit" className={ui.btn}>
            Guardar contenido
          </button>
        </div>
        <NoticeBox notice={notice} />
      </form>
      {/* Fuera del formulario de contenido: el modal tiene sus propios formularios. */}
      {showCategories ? (
        <CategoriesDialog
          onClose={() => {
            setShowCategories(false);
            categoriesButtonRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function CommerceForm({ product }: { product: AdminProduct }) {
  const service = useAdminService();
  const id = useId();
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock + product.reserved));
  const [commission, setCommission] = useState(commissionToInput(product.commissionPerUnit));
  const [notice, setNotice] = useState<Notice>(null);
  const parsedCommission = parseCommissionInput(commission);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (stock.trim() === "") {
      setNotice({ kind: "error", text: "EMPTY_STOCK: el stock está vacío. Una celda en blanco no debe dejar el producto sin stock; escribe 0 si es lo que quieres." });
      return;
    }
    if (parsedCommission === undefined) {
      setNotice({ kind: "error", text: "Revisa la comisión: un monto en pesos, sin decimales (por ejemplo 1.500)." });
      return;
    }
    try {
      const result = await service.updateProductCommerce({
        sku: product.sku,
        price: Number(price.replace(/[$.\s]/g, "")),
        stock: Number(stock),
        commissionPerUnit: parsedCommission,
      });
      setNotice({
        kind: "ok",
        text: sim(
            `Comercio guardado (simulado). Precio final ${formatClp(result.finalPrice)}, stock disponible ${result.stock}, ${result.commissionPerUnit === null ? "sin comisión" : `comisión ${formatClp(result.commissionPerUnit)} por unidad`}.`,
          ) + (result.warnings.length ? ` ${result.warnings.join(" ")}` : ""),
      });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }

  return (
    <form className={`${ui.card} ${ui.form}`} onSubmit={onSubmit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Comercio</h2>
      <div className={ui.fields}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-price`}>
            Precio de lista (CLP)
          </label>
          <input id={`${id}-price`} className={ui.input} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          <span className={ui.help}>Entero entre 1 y 10.000.000.</span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-stock`}>
            Stock físico
          </label>
          <input id={`${id}-stock`} className={ui.input} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
          <span className={ui.help}>
            Reservado por pedidos pendientes: {product.reserved}. Disponible para vender = físico − reservado (hoy {product.stock}).
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-rate`}>
            Comisión por unidad (CLP)
          </label>
          <input
            id={`${id}-rate`}
            className={ui.input}
            inputMode="numeric"
            placeholder="Sin definir"
            value={commission}
            aria-invalid={parsedCommission === undefined ? true : undefined}
            aria-describedby={`${id}-rate-help`}
            onChange={(e) => setCommission(e.target.value)}
          />
          <span id={`${id}-rate-help`} className={ui.help}>
            {parsedCommission === undefined
              ? "Un monto en pesos, sin decimales; por ejemplo 1.500."
              : parsedCommission === null
                ? "Déjalo vacío si el químico aún no la define."
                : `Ganas ${formatClp(parsedCommission)} por cada unidad vendida. Se aplica a las ventas nuevas.`}
          </span>
        </div>
      </div>
      {product.discount ? (
        <p className={ui.help}>
          Descuento vigente: {product.discount.type === "percent" ? `${product.discount.value} %` : formatClp(product.discount.value)}. Precio final{" "}
          {formatClp(product.finalPrice)}.
        </p>
      ) : null}
      <div className={ui.actions}>
        <button type="submit" className={ui.btn}>
          Guardar comercio
        </button>
      </div>
      <NoticeBox notice={notice} />
    </form>
  );
}
