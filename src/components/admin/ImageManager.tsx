"use client";

// Imágenes del producto: subir con vista previa, compresión a WebP en el navegador
// (lado largo <= 1600 px y <= 2 MiB), reordenar y quitar. Con Firebase se sube a Storage; en la demo no.
import { useId, useRef, useState } from "react";
import { errorMessage } from "@/lib/admin/errors";
import { compressToWebp, formatBytes, MAX_IMAGES_PER_PRODUCT, validateImageFile } from "@/lib/admin/image";
import type { AdminImage, AdminProduct } from "@/lib/admin/types";
import { useAdminService, useDemoPersistence } from "./AdminProvider";
import ui from "./admin.module.css";
import { sim } from "@/lib/admin/mode";

export function ImageManager({ product }: { product: AdminProduct }) {
  const service = useAdminService();
  const persistence = useDemoPersistence();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<AdminImage[]>(product.images);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  function update(next: AdminImage[]) {
    setImages(next);
    setDirty(true);
    setResult(null);
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setResult(null);
    const notes: string[] = [];
    let current = images;
    for (const file of Array.from(files)) {
      const check = validateImageFile(file, current.length);
      if (!check.ok) {
        notes.push(`${file.name}: ${check.message}`);
        continue;
      }
      try {
        const compressed = await compressToWebp(file);
        let image: AdminImage;
        if (service.uploadProductImage) {
          // Firebase: sube el WebP a Storage (products/{sku}/{id}.webp) y devuelve la ruta y la URL pública.
          image = await service.uploadProductImage(product.sku, compressed.blob);
          URL.revokeObjectURL(compressed.previewUrl);
          image = { ...image, bytes: compressed.bytes };
        } else if (persistence) {
          // Persistencia local (D-030): el servidor guarda el archivo y devuelve la ruta (nombre generado por él).
          const uploaded = await persistence.uploadImage(product.sku, compressed.blob);
          URL.revokeObjectURL(compressed.previewUrl);
          image = { path: uploaded.path, alt: "", previewUrl: uploaded.url, bytes: compressed.bytes };
        } else {
          const imageId = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
          image = { path: `products/${product.sku}/${imageId}.webp`, alt: "", previewUrl: compressed.previewUrl, bytes: compressed.bytes };
        }
        current = [...current, image];
        notes.push(
          `${file.name}: convertida a WebP ${compressed.width}×${compressed.height}, ${formatBytes(compressed.originalBytes)} → ${formatBytes(compressed.bytes)}.`,
        );
      } catch (error) {
        notes.push(`${file.name}: ${errorMessage(error)}`);
      }
    }
    setMessages(notes);
    if (current !== images) update(current);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target]!, next[index]!];
    update(next);
  }

  function remove(index: number) {
    const removed = images[index];
    if (removed?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
    update(images.filter((_, i) => i !== index));
  }

  async function save() {
    if (images.some((img) => img.alt.trim() === "" || img.alt.length > 140)) {
      setResult({ kind: "error", text: "Cada imagen necesita un texto alternativo de 1 a 140 caracteres." });
      return;
    }
    try {
      await service.updateProductContent(product.sku, { images });
      setDirty(false);
      setResult({ kind: "ok", text: persistence ? "Imágenes guardadas en este PC. Ya se ven en la tienda al recargar." : sim("Imágenes guardadas (simulado).") });
    } catch (error) {
      setResult({ kind: "error", text: errorMessage(error) });
    }
  }

  return (
    <section className={`${ui.card} ${ui.section}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Imágenes</h2>
      <p className={ui.help}>
        Hasta {MAX_IMAGES_PER_PRODUCT} imágenes. Se convierten a WebP en tu navegador (lado largo máximo de 1600 px y peso máximo de 2 MiB). La primera es la principal.
      </p>
      <div className={ui.field}>
        <label className={ui.label} htmlFor={`${id}-file`}>
          Subir imágenes (JPG, PNG, WebP o GIF)
        </label>
        <input
          ref={inputRef}
          id={`${id}-file`}
          className={ui.input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          disabled={busy || images.length >= MAX_IMAGES_PER_PRODUCT}
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
      <div aria-live="polite">
        {busy ? <p className={ui.alert}>Procesando imágenes…</p> : null}
        {messages.length > 0 ? (
          <ul className={ui.help}>
            {messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {images.length === 0 ? (
        <p className={ui.empty}>Este producto aún no tiene imágenes. Para publicarlo necesitas al menos una.</p>
      ) : (
        <ol className={ui.imageList}>
          {images.map((img, index) => (
            <li key={img.path} className={ui.imageItem}>
              {img.previewUrl ? (
                // Vista previa local (blob:): next/image no aplica a URLs de objeto del navegador.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.previewUrl} alt={img.alt || "Vista previa sin texto alternativo"} />
              ) : (
                <p className={ui.empty}>Sin vista previa (ya está en Storage)</p>
              )}
              <p className={ui.help}>
                {index === 0 ? <strong>Principal. </strong> : null}
                {img.bytes ? formatBytes(img.bytes) : null}
              </p>
              <div className={ui.field}>
                <label className={ui.label} htmlFor={`${id}-alt-${index}`}>
                  Texto alternativo
                </label>
                <input
                  id={`${id}-alt-${index}`}
                  className={ui.input}
                  maxLength={140}
                  value={img.alt}
                  onChange={(e) => update(images.map((it, i) => (i === index ? { ...it, alt: e.target.value } : it)))}
                />
              </div>
              <div className={ui.imageActions}>
                <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Mover la imagen ${index + 1} antes`}>
                  ←
                </button>
                <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={index === images.length - 1} onClick={() => move(index, 1)} aria-label={`Mover la imagen ${index + 1} después`}>
                  →
                </button>
                <button type="button" className={`${ui.btn} ${ui.btnDangerOutline}`} onClick={() => remove(index)} aria-label={`Quitar la imagen ${index + 1}`}>
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className={ui.actions}>
        <button type="button" className={ui.btn} disabled={!dirty} onClick={() => void save()}>
          Guardar imágenes
        </button>
        {dirty ? <span className={ui.help}>Hay cambios sin guardar.</span> : null}
      </div>
      <div aria-live="polite">
        {result ? (
          <p className={`${ui.alert} ${result.kind === "ok" ? ui.alertOk : ui.alertError}`} role={result.kind === "error" ? "alert" : "status"}>
            {result.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
