"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import styles from "./CartLink.module.css";

/** Ícono del carrito con contador. El contador aparece tras hidratar (el servidor no conoce el carrito). */
export function CartLink() {
  const { count, hydrated } = useCart();
  const shown = hydrated ? count : 0;
  return (
    <Link
      href="/carrito"
      className={styles.link}
      aria-label={shown > 0 ? `Carrito, ${shown} ${shown === 1 ? "producto" : "productos"}` : "Carrito, vacío"}
    >
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
        <path d="M3 4h2.2l2.4 11h10.2l2-8H6.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9.5" cy="19.5" r="1.5" fill="currentColor" />
        <circle cx="17" cy="19.5" r="1.5" fill="currentColor" />
      </svg>
      {shown > 0 ? (
        <span className={styles.count} aria-hidden="true">
          {shown > 99 ? "99+" : shown}
        </span>
      ) : null}
    </Link>
  );
}
