import { formatClp } from "@/lib/format";
import type { DeliveryType, Summary } from "@/lib/checkout";
import styles from "./checkout.module.css";

interface OrderSummaryProps {
  summary: Summary;
  /** null = carrito (el envío se calcula en el checkout). */
  delivery: DeliveryType | null;
  /** Muestra las líneas resumidas (checkout). */
  showLines?: boolean;
  headingId: string;
}

/** Resumen del pedido: subtotal, descuentos, envío y total. Los valores son solo para mostrar (D-005). */
export function OrderSummary({ summary, delivery, showLines = false, headingId }: OrderSummaryProps) {
  const checkout = delivery !== null;
  return (
    <section className={`${styles.panel} ${styles.soft}`} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.panelTitle}>
        Resumen
      </h2>
      {showLines ? (
        <ul className={styles.miniLines}>
          {summary.lines.map((l) => (
            <li key={l.sku} className={styles.miniLine}>
              <span>
                {l.qty} × {l.name}
              </span>
              <span>{formatClp(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className={styles.summaryList}>
        {summary.discountTotal > 0 ? (
          <div className={styles.summaryRow}>
            <dt>Productos</dt>
            <dd>{formatClp(summary.listSubtotal)}</dd>
          </div>
        ) : null}
        {summary.discountTotal > 0 ? (
          <div className={`${styles.summaryRow} ${styles.discount}`}>
            <dt>Descuentos</dt>
            <dd>-{formatClp(summary.discountTotal)}</dd>
          </div>
        ) : null}
        <div className={styles.summaryRow}>
          <dt>Subtotal</dt>
          <dd>{formatClp(summary.subtotal)}</dd>
        </div>
        {checkout ? (
          <div className={styles.summaryRow}>
            <dt>{delivery === "pickup" ? "Retiro en tienda" : "Despacho"}</dt>
            <dd>{summary.shipping === 0 ? "Gratis" : formatClp(summary.shipping)}</dd>
          </div>
        ) : (
          <div className={styles.summaryRow}>
            <dt>Envío</dt>
            <dd>En el checkout</dd>
          </div>
        )}
        {checkout ? (
          <div className={`${styles.summaryRow} ${styles.totalRow}`}>
            <dt>Total</dt>
            <dd>{formatClp(summary.total)}</dd>
          </div>
        ) : null}
      </dl>
      {checkout && summary.missingForFreeShipping !== null && delivery === "shipping" ? (
        <p className={styles.summaryNote}>
          Agrega {formatClp(summary.missingForFreeShipping)} más y el despacho es gratis.
        </p>
      ) : null}
      {checkout && summary.freeShippingApplied ? (
        <p className={styles.summaryNote}>Tu pedido alcanzó el envío gratis.</p>
      ) : null}
      <p className={styles.summaryNote}>
        {checkout
          ? "El total final lo confirma el servidor al crear el pedido."
          : "El envío se calcula en el checkout, según la entrega que elijas."}
      </p>
    </section>
  );
}
