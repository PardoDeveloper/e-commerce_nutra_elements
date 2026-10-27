"use client";

// Paginación numerada del admin: Anterior, números con saltos y Siguiente.
import { pageNumbers } from "@/lib/admin/order-history";
import styles from "./pagination.module.css";

interface Props {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  /** Texto accesible de la navegación, por ejemplo "Páginas del historial". */
  label: string;
}

export function Pagination({ page, pages, onChange, label }: Props) {
  if (pages <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label={label}>
      <button type="button" className={styles.step} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <span aria-hidden="true">‹</span> Anterior
      </button>
      <ul className={styles.pages}>
        {pageNumbers(page, pages).map((n, i) =>
          n === "…" ? (
            <li key={`gap-${i}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={n}>
              <button
                type="button"
                className={styles.page}
                aria-current={n === page ? "page" : undefined}
                aria-label={`Página ${n}`}
                onClick={() => onChange(n)}
              >
                {n}
              </button>
            </li>
          ),
        )}
      </ul>
      <button type="button" className={styles.step} disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Siguiente <span aria-hidden="true">›</span>
      </button>
    </nav>
  );
}
