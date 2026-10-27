"use client";

// Modal genérico del admin: <dialog> con showModal() (el navegador atrapa el foco, deja inerte el resto y
// cierra con Escape). Sirve para los mantenedores chicos (categorías y los que vengan, como marcas) sin crear
// una página por cada uno. El que lo abre devuelve el foco al botón de origen (onClose).
import { useEffect, useId, useRef, type ReactNode } from "react";
import ui from "./admin.module.css";

interface Props {
  title: string;
  /** Texto bajo el título (opcional). */
  description?: ReactNode;
  onClose: () => void;
  /** Mientras es true no se cierra (operación en curso). */
  busy?: boolean;
  /** Ancho mayor, para tablas. */
  wide?: boolean;
  children: ReactNode;
}

export function AdminDialog({ title, description, onClose, busy = false, wide = false, children }: Props) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);

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
      className={`${ui.dialog} ${wide ? ui.dialogWide : ""}`}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-desc` : undefined}
      // Escape dispara "cancel": se cierra desde el estado del padre, no solo desde el DOM.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className={ui.dialogHead}>
        <h2 id={`${id}-title`}>{title}</h2>
        <button type="button" className={`${ui.btn} ${ui.btnOutline}`} disabled={busy} onClick={onClose}>
          Cerrar
        </button>
      </div>
      {description ? (
        <p id={`${id}-desc`} className={ui.help}>
          {description}
        </p>
      ) : null}
      <div className={ui.stack}>{children}</div>
    </dialog>
  );
}
