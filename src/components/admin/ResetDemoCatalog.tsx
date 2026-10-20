"use client";

// Botón «Restablecer catálogo de la demo» (D-030): borra los cambios de productos guardados en el
// servidor y las imágenes subidas. Solo aparece con la persistencia local activa.
import { useEffect, useId, useRef, useState } from "react";
import { errorMessage } from "@/lib/admin/errors";
import { useDemoPersistence } from "./AdminProvider";
import ui from "./admin.module.css";

export function ResetDemoCatalog() {
  const persistence = useDemoPersistence();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  if (!persistence) return null;

  function close() {
    setOpen(false);
    setError(null);
    openerRef.current?.focus();
  }

  async function confirm() {
    if (!persistence) return;
    setBusy(true);
    setError(null);
    try {
      await persistence.reset();
      // Recarga completa: el panel vuelve a pedir el catálogo original al servidor.
      window.location.reload();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className={`${ui.card} ${ui.section}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Catálogo de la demo</h2>
      <p className={ui.help}>
        Los cambios de productos (contenido, imágenes, precios, stock, publicación, eliminados y descuentos) se guardan en este PC. Puedes volver al catálogo original.
      </p>
      <div className={ui.actions}>
        <button ref={openerRef} type="button" className={`${ui.btn} ${ui.btnDangerOutline}`} onClick={() => setOpen(true)}>
          Restablecer catálogo de la demo
        </button>
      </div>
      {open ? (
        <dialog
          ref={dialogRef}
          className={ui.dialog}
          aria-labelledby={`${id}-dlg-title`}
          aria-describedby={`${id}-dlg-desc`}
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) close();
          }}
        >
          <h2 id={`${id}-dlg-title`}>Restablecer catálogo de la demo</h2>
          <div id={`${id}-dlg-desc`} className={ui.stack}>
            <p>Se borrarán todos los cambios de productos guardados y las imágenes subidas. El catálogo vuelve al estado original. Esta acción no se puede deshacer.</p>
            <div aria-live="polite">
              {error ? (
                <p className={`${ui.alert} ${ui.alertError}`} role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
          <div className={ui.actions}>
            <button type="button" className={`${ui.btn} ${ui.btnDanger}`} disabled={busy} onClick={() => void confirm()}>
              {busy ? "Restableciendo…" : "Confirmar y restablecer"}
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={close}>
              Cancelar
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
