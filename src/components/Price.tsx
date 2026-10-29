import { discountPercent, formatClp } from "@/lib/format";
import styles from "./Price.module.css";

interface PriceProps {
  /** Precio de lista (CLP). */
  price: number;
  /** Precio final con descuento. Si es menor que `price`, se muestra como oferta con el precio normal tachado. */
  finalPrice?: number;
  size?: "md" | "lg";
}

/**
 * Precio en CLP (`$12.990`). Con descuento (aplicado desde Descuentos en el admin), estilo retail:
 * precio oferta destacado con el % de descuento y, debajo, el precio normal tachado.
 */
export function Price({ price, finalPrice, size = "md" }: PriceProps) {
  const final = finalPrice ?? price;
  const percent = discountPercent(price, final);
  const sizeClass = size === "lg" ? styles.lg : "";
  if (percent <= 0) {
    return (
      <div className={`${styles.price} ${sizeClass}`}>
        <span className={styles.current}>
          <span className="visually-hidden">Precio: </span>
          {formatClp(final)}
        </span>
      </div>
    );
  }
  return (
    <div className={`${styles.price} ${styles.onSale} ${sizeClass}`}>
      <span className={styles.row}>
        <span className={`${styles.current} ${styles.sale}`}>
          <span className="visually-hidden">Precio oferta: </span>
          {formatClp(final)}
        </span>
        <span className={styles.badge}>
          -{percent}%<span className="visually-hidden"> de descuento</span>
        </span>
      </span>
      <span className={styles.old}>
        Normal: <s>{formatClp(price)}</s>
      </span>
    </div>
  );
}
