import styles from "./StockBadge.module.css";

/** Estado de disponibilidad. Siempre texto + ícono, nunca solo color. */
export function StockBadge({ inStock }: { inStock: boolean }) {
  return (
    <span className={`${styles.badge} ${inStock ? styles.in : styles.out}`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        {inStock ? (
          <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
      {inStock ? "Disponible" : "Sin stock"}
    </span>
  );
}
