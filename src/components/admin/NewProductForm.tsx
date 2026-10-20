"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/admin/errors";
import { useAdminService } from "./AdminProvider";
import ui from "./admin.module.css";

export function NewProductForm() {
  const service = useAdminService();
  const router = useRouter();
  const id = useId();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await service.createProduct({
        sku: sku.trim(),
        name,
        price: Number(price.replace(/[$.\s]/g, "")),
        stock: stock.trim() === "" ? Number.NaN : Number(stock),
        barcode: barcode.trim() || undefined,
      });
      router.push(`/admin/productos/${encodeURIComponent(sku.trim())}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className={ui.page}>
      <nav aria-label="Ruta de navegación" className={ui.help}>
        <Link href="/admin/productos">Productos</Link> / Nuevo
      </nav>
      <h1>Nuevo producto</h1>
      <p className={ui.lead}>Se crea sin publicar. Después completa el contenido y las imágenes y publícalo.</p>
      <form className={`${ui.card} ${ui.form}`} onSubmit={onSubmit} noValidate>
        <div className={ui.fields}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-sku`}>
              SKU
            </label>
            <input id={`${id}-sku`} className={ui.input} value={sku} maxLength={32} onChange={(e) => setSku(e.target.value)} aria-describedby={`${id}-sku-help`} />
            <span id={`${id}-sku-help`} className={ui.help}>
              Letras, números, guion y guion bajo (máx. 32).
            </span>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-name`}>
              Nombre
            </label>
            <input id={`${id}-name`} className={ui.input} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-price`}>
              Precio de lista (CLP)
            </label>
            <input id={`${id}-price`} className={ui.input} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-stock`}>
              Stock inicial
            </label>
            <input id={`${id}-stock`} className={ui.input} inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
          <div className={`${ui.field} ${ui.fieldFull}`}>
            <label className={ui.label} htmlFor={`${id}-barcode`}>
              Código de barras (opcional)
            </label>
            <input id={`${id}-barcode`} className={ui.input} inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
          </div>
        </div>
        <div aria-live="polite">
          {error ? (
            <p className={`${ui.alert} ${ui.alertError}`} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={ui.actions}>
          <button type="submit" className={ui.btn}>
            Crear producto
          </button>
          <Link href="/admin/productos" className={`${ui.btn} ${ui.btnOutline}`}>
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
