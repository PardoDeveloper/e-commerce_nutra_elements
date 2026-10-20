import { discountPercent, formatClp } from "@/lib/format";
import styles from "./Price.module.css";

interface PriceProps {
  /** Precio de lista (CLP). */
  price: number;
  /** Precio final con descuento. Si es menor que `price`, se muestra el precio tachado y el badge. */
  finalPrice?: number;
  size?: "md" | "lg";
}

/** Precio en CLP (`$12.990`), con precio de lista tachado y badge si hay descuento. */
export function Price({ price, finalPrice, size = "md" }: PriceProps) {
  const final = finalPrice ?? price;
  const percent = discountPercent(price, final);
  return (
    <div className={`${styles.price} ${size === "lg" ? styles.lg : ""}`}>
      <span className={styles.current}>
        <span className="visually-hidden">{percent > 0 ? "Precio con descuento: " : "Precio: "}</span>
        {formatClp(final)}
      </span>
      {percent > 0 ? (
        <>
          <s className={styles.old}>
            <span className="visually-hidden">Precio normal: </span>
            {formatClp(price)}
          </s>
          <span className={styles.badge}>-{percent}%</span>
        </>
      ) : null}
    </div>
  );
}
