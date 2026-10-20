"use client";

// Diálogo modal de confirmación para eliminar productos (D-029). Usa <dialog> con showModal():
// el navegador atrapa el foco dentro, deja inerte el resto de la página y cierra con Escape.
// El que lo abre es responsable de devolver el foco al botón de origen (onCancel).
import { useEffect, useId, useRef, useState } from "react";
import { canConfirmDelete, CONFIRM_WORD, namesPreview, requiresConfirmWord } from "@/lib/admin/selection";
import ui from "./admin.module.css";

interface Props {
  /** Nombres de los productos a eliminar, en el orden de la tabla. */
  names: string[];
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteDialog({ names, busy, error, onConfirm, onCancel }: Props) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const count = names.length;
  const needsWord = requiresConfirmWord(count);
  const { shown, more } = namesPreview(names);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={ui.dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      // Escape dispara "cancel": se cierra desde el estado del padre, no solo desde el DOM.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={`${id}-title`}>
        Eliminar {count} {count === 1 ? "producto" : "productos"}
      </h2>
      <div id={`${id}-desc`} className={ui.stack}>
        <p>
          Se {count === 1 ? "eliminará" : "eliminarán"} <strong>{count}</strong> {count === 1 ? "producto" : "productos"}. Desaparecen de la tienda y de la lista del
          admin, pero se conservan para los pedidos y el historial. Puedes restaurarlos desde el filtro «Eliminados».
        </p>
        <ul className={ui.dialogList}>
          {shown.map((name, i) => (
            <li key={`${i}-${name}`}>{name}</li>
          ))}
        </ul>
        {more > 0 ? <p className={ui.help}>y {more} más</p> : null}
        {needsWord ? (
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-word`}>
              Para confirmar, escribe {CONFIRM_WORD} en mayúsculas
            </label>
            <input
              id={`${id}-word`}
              className={ui.input}
              value={typed}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        ) : null}
        <div aria-live="polite">
          {error ? (
            <p className={`${ui.alert} ${ui.alertError}`} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <div className={ui.actions}>
        <button type="button" className={`${ui.btn} ${ui.btnDanger}`} disabled={busy || !canConfirmDelete(count, typed)} onClick={onConfirm}>
          {busy ? "Eliminando…" : "Confirmar eliminación"}
        </button>
        <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </dialog>
  );
}
