"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Price } from "@/components/Price";
import { ProductImage } from "@/components/ProductImage";
import { toOrderItems, useCart, DEFAULT_MAX_QTY } from "@/lib/cart";
import { computeSummary, type CatalogEntry } from "@/lib/checkout";
import { formatClp } from "@/lib/format";
import styles from "./checkout.module.css";
import { OrderSummary } from "./OrderSummary";

interface CartViewProps {
  catalog: Record<string, CatalogEntry>;
  settings: { shippingFee: number; freeShippingThreshold: number | null };
}

export function CartView({ catalog, settings }: CartViewProps) {
  const cart = useCart();
  const [announcement, setAnnouncement] = useState("");

  if (!cart.hydrated) {
    return (
      <div className={styles.skeleton} role="status" aria-live="polite">
        <span className="visually-hidden">Cargando tu carrito…</span>
        <div className={styles.skeletonBar} />
        <div className={styles.skeletonBar} />
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div className={`${styles.panel} ${styles.empty}`}>
        <h2 className={styles.panelTitle}>Tu carrito está vacío</h2>
        <p>Agrega productos desde el catálogo para armar tu pedido.</p>
        <Button href="/productos">Ver productos</Button>
        {announcement ? (
          <p className="visually-hidden" role="status">
            {announcement}
          </p>
        ) : null}
      </div>
    );
  }

  const summary = computeSummary({ items: toOrderItems(cart.lines), catalog, settings, delivery: null });
  const blocked = summary.missingSkus.length > 0 || summary.lines.some((l) => !l.inStock);

  return (
    <div className={styles.layout}>
      <section aria-labelledby="cart-lines-title" className={styles.panel}>
        <h2 id="cart-lines-title" className={styles.panelTitle}>
          Productos ({cart.count})
        </h2>
        {blocked ? (
          <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert">
            <p className={styles.noticeTitle}>Revisa tu carrito</p>
            <p>Hay productos sin stock o que ya no están disponibles. Quítalos para continuar.</p>
          </div>
        ) : null}
        <ul className={styles.lines}>
          {cart.lines.map((line) => {
            const entry = catalog[line.sku];
            const missing = !entry;
            const outOfStock = entry ? !entry.inStock : false;
            const unitFinal = entry ? entry.finalPrice : line.finalPrice;
            const unitList = entry ? entry.price : line.unitPrice;
            const name = entry ? entry.name : line.name;
            const max = DEFAULT_MAX_QTY;
            return (
              <li key={line.sku} className={styles.line}>
                <div className={styles.thumb}>
                  <ProductImage name={name} categoryId={line.categoryId} alt="" image={entry?.imageUrl ? { url: entry.imageUrl, alt: "" } : null} />
                </div>
                <div className={styles.lineBody}>
                  {missing ? (
                    <span className={styles.lineName}>{name}</span>
                  ) : (
                    <Link href={`/productos/${entry.slug}`} className={styles.lineName}>
                      {name}
                    </Link>
                  )}
                  {missing ? (
                    <p className={styles.muted}>Este producto ya no está disponible.</p>
                  ) : (
                    <>
                      <Price price={unitList} finalPrice={unitFinal} />
                      {outOfStock ? <p className={styles.muted}>Sin stock por ahora.</p> : null}
                    </>
                  )}
                  <div className={styles.lineControls}>
                    {missing ? null : (
                      <div className={styles.stepper} role="group" aria-label={`Cantidad de ${name}`}>
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() => cart.setQuantity(line.sku, line.qty - 1)}
                          aria-label={`Quitar una unidad de ${name}`}
                          disabled={line.qty <= 1}
                        >
                          −
                        </button>
                        <span className={styles.qty}>
                          <span className="visually-hidden">Cantidad: </span>
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() => cart.setQuantity(line.sku, line.qty + 1)}
                          aria-label={`Agregar una unidad de ${name}`}
                          disabled={line.qty >= max}
                        >
                          +
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => {
                        cart.remove(line.sku);
                        setAnnouncement(`${name} se quitó del carrito.`);
                      }}
                      aria-label={`Quitar ${name} del carrito`}
                    >
                      Quitar
                    </button>
                    {missing ? null : (
                      <span className={styles.lineSubtotal}>
                        <span className="visually-hidden">Subtotal de la línea: </span>
                        {formatClp(unitFinal * line.qty)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="visually-hidden" role="status">
          {announcement}
        </p>
      </section>

      <aside className={styles.aside} aria-label="Resumen y pago">
        <OrderSummary summary={summary} delivery={null} headingId="cart-summary-title" />
        {blocked ? (
          <Button fullWidth size="lg" disabled aria-disabled="true">
            Ir a pagar
          </Button>
        ) : (
          <Button href="/checkout" fullWidth size="lg">
            Ir a pagar
          </Button>
        )}
        <p className={styles.summaryNote}>
          <Link href="/productos">Seguir comprando</Link>
        </p>
      </aside>
    </div>
  );
}
