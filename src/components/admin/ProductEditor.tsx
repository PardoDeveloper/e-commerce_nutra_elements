"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/admin/errors";
import { CATEGORY_LABELS } from "@/lib/admin/labels";
import type { AdminProduct } from "@/lib/admin/types";
import type { CategoryId } from "@/lib/data/types";
import { formatClp } from "@/lib/format";
import { useAdminService, useAdminState, useDataSource } from "./AdminProvider";
import { ImageManager } from "./ImageManager";
import { formatDate } from "./format";
import ui from "./admin.module.css";
import { sim } from "@/lib/admin/mode";

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
  const id = useId();
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug ?? "");
  const [categoryId, setCategoryId] = useState<string>(product.categoryId ?? "");
  const [shortDescription, setShortDescription] = useState(product.shortDescription ?? "");
  const [description, setDescription] = useState(product.description ?? "");
  const [format, setFormat] = useState(product.format ?? "");
  const [units, setUnits] = useState(product.unitsPerPack?.toString() ?? "");
  const [family, setFamily] = useState(product.family ?? "");
  const [seoTitle, setSeoTitle] = useState(product.seo?.title ?? "");
  const [seoDescription, setSeoDescription] = useState(product.seo?.description ?? "");
  const [notice, setNotice] = useState<Notice>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const unitsValue = units.trim() === "" ? null : Number(units);
    if (unitsValue !== null && (!Number.isInteger(unitsValue) || unitsValue < 1 || unitsValue > 1000)) {
      setNotice({ kind: "error", text: "Las unidades por envase deben ser un entero entre 1 y 1000." });
      return;
    }
    try {
      await service.updateProductContent(product.sku, {
        name,
        // El slug no se puede cambiar con el producto publicado: solo se envía si cambió.
        ...(slug.trim() !== (product.slug ?? "") ? { slug: slug.trim() === "" ? null : slug.trim() } : {}),
        categoryId: categoryId === "" ? null : (categoryId as CategoryId),
        shortDescription: shortDescription.trim() === "" ? null : shortDescription,
        description: description.trim() === "" ? null : description,
        format: format.trim() === "" ? null : format.trim(),
        unitsPerPack: unitsValue,
        family: family.trim() === "" ? null : family.trim(),
        seo: seoTitle.trim() === "" && seoDescription.trim() === "" ? null : { title: seoTitle.trim() || undefined, description: seoDescription.trim() || undefined },
      });
      setNotice({ kind: "ok", text: sim("Contenido guardado (simulado).") });
    } catch (error) {
      setNotice({ kind: "error", text: errorMessage(error) });
    }
  }

  return (
    <form className={`${ui.card} ${ui.form}`} onSubmit={onSubmit} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Contenido</h2>
      <p className={ui.alert}>
        Redacta sin atribuir al suplemento propiedades de curar, tratar o prevenir enfermedades (normativa chilena sobre suplementos alimentarios).
      </p>
      <div className={ui.fields}>
        <div className={`${ui.field} ${ui.fieldFull}`}>
          <label className={ui.label} htmlFor={`${id}-name`}>
            Nombre para mostrar
          </label>
          <input id={`${id}-name`} className={ui.input} value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} />
          <span className={ui.help}>Nombre original de la planilla: {product.sourceName}</span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-slug`}>
            Slug (URL)
          </label>
          <input
            id={`${id}-slug`}
            className={ui.input}
            value={slug}
            maxLength={80}
            disabled={product.published}
            aria-describedby={`${id}-slug-help`}
            onChange={(e) => setSlug(e.target.value)}
          />
          <span id={`${id}-slug-help`} className={ui.help}>
            {product.published ? "No se puede cambiar mientras el producto está publicado." : "Minúsculas, números y guiones. Debe ser único."}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-cat`}>
            Categoría
          </label>
          <select id={`${id}-cat`} className={ui.select} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sin categoría</option>
            {Object.entries(CATEGORY_LABELS).map(([slugValue, label]) => (
              <option key={slugValue} value={slugValue}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className={`${ui.field} ${ui.fieldFull}`}>
          <label className={ui.label} htmlFor={`${id}-short`}>
            Descripción corta
          </label>
          <textarea id={`${id}-short`} className={ui.textarea} maxLength={300} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
          <span className={ui.help}>{shortDescription.length}/300</span>
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
            Formato
          </label>
          <input id={`${id}-format`} className={ui.input} value={format} onChange={(e) => setFormat(e.target.value)} placeholder="capsulas" />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-units`}>
            Unidades por envase
          </label>
          <input id={`${id}-units`} className={ui.input} inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} />
        </div>
        <div className={`${ui.field} ${ui.fieldFull}`}>
          <label className={ui.label} htmlFor={`${id}-family`}>
            Familia (agrupa los tamaños de un mismo producto)
          </label>
          <input id={`${id}-family`} className={ui.input} value={family} onChange={(e) => setFamily(e.target.value)} />
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-seot`}>
            Título SEO
          </label>
          <input id={`${id}-seot`} className={ui.input} maxLength={70} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
          <span className={ui.help}>{seoTitle.length}/70</span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`${id}-seod`}>
            Descripción SEO
          </label>
          <input id={`${id}-seod`} className={ui.input} maxLength={170} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
          <span className={ui.help}>{seoDescription.length}/170</span>
        </div>
      </div>
      <div className={ui.actions}>
        <button type="submit" className={ui.btn}>
          Guardar contenido
        </button>
      </div>
      <NoticeBox notice={notice} />
    </form>
  );
}

function CommerceForm({ product }: { product: AdminProduct }) {
  const service = useAdminService();
  const id = useId();
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock + product.reserved));
  const [notice, setNotice] = useState<Notice>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (stock.trim() === "") {
      setNotice({ kind: "error", text: "EMPTY_STOCK: el stock está vacío. Una celda en blanco no debe dejar el producto sin stock; escribe 0 si es lo que quieres." });
      return;
    }
    try {
      const result = await service.updateProductCommerce({
        sku: product.sku,
        price: Number(price.replace(/[$.\s]/g, "")),
        stock: Number(stock),
      });
      setNotice({
        kind: "ok",
        text: sim(`Comercio guardado (simulado). Precio final ${formatClp(result.finalPrice)}, stock disponible ${result.stock}.`) + (result.warnings.length ? ` ${result.warnings.join(" ")}` : ""),
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
      </div>
      <p className={ui.alert}>
        {product.discount
          ? `Descuento vigente: ${product.discount.type === "percent" ? `${product.discount.value}%` : formatClp(product.discount.value)}. Precio final ${formatClp(product.finalPrice)}.`
          : "Sin descuento."}{" "}
        Los descuentos se administran en <Link href="/admin/descuentos">Descuentos</Link>.
      </p>
      <div className={ui.actions}>
        <button type="submit" className={ui.btn}>
          Guardar comercio
        </button>
      </div>
      <NoticeBox notice={notice} />
    </form>
  );
}
