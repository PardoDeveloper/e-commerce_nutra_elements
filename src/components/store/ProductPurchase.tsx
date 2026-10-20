"use client";

import { useState } from "react";
import { AddToCartButton } from "@/components/AddToCartButton";
import type { Product } from "@/lib/data/types";
import styles from "./store.module.css";

type PurchaseProduct = Pick<Product, "sku" | "name" | "slug" | "categoryId" | "price" | "finalPrice" | "inStock">;

/** Selector de cantidad y botón de agregar de la ficha. Máximo configurable (por defecto 10, D-027). */
export function ProductPurchase({ product, max = 10 }: { product: PurchaseProduct; max?: number }) {
  const [qty, setQty] = useState(1);

  return (
    <div className={styles.qtyRow}>
      <div className={styles.qty} role="group" aria-label="Cantidad">
        <button
          type="button"
          className={styles.qtyBtn}
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          disabled={!product.inStock || qty <= 1}
          aria-label="Disminuir cantidad"
        >
          &minus;
        </button>
        <span className={styles.qtyValue} aria-live="polite">
          {qty}
        </span>
        <button
          type="button"
          className={styles.qtyBtn}
          onClick={() => setQty((q) => Math.min(max, q + 1))}
          disabled={!product.inStock || qty >= max}
          aria-label="Aumentar cantidad"
        >
          +
        </button>
      </div>
      <AddToCartButton product={product} qty={qty} size="lg" />
    </div>
  );
}
