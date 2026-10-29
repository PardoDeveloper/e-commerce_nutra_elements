"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./CategoryProducts.module.css";

export interface CategoryPanel {
  slug: string;
  name: string;
  /** Contenido del panel (grilla de productos), renderizado en el servidor. */
  content: ReactNode;
}

interface CategoryProductsProps {
  panels: CategoryPanel[];
  label: string;
}

/**
 * Pestañas del inicio con los productos de cada categoría. Todos los paneles vienen en el HTML
 * (los buscadores ven todos los productos); el JS solo alterna cuál se muestra. Teclado según el
 * patrón de pestañas de WAI-ARIA: flechas, Inicio y Fin.
 */
export function CategoryProducts({ panels, label }: CategoryProductsProps) {
  const id = useId();
  const [active, setActive] = useState(0);
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = panels.length - 1;
    const next =
      event.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : event.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabsRef.current[next]?.focus();
  }

  return (
    <div className={styles.wrapper}>
      <div role="tablist" aria-label={label} className={styles.tabs} onKeyDown={onKeyDown}>
        {panels.map((p, i) => (
          <button
            key={p.slug}
            ref={(el) => {
              tabsRef.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${p.slug}`}
            aria-controls={`${id}-panel-${p.slug}`}
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            className={styles.tab}
            onClick={() => setActive(i)}
          >
            {p.name}
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div
          key={p.slug}
          role="tabpanel"
          id={`${id}-panel-${p.slug}`}
          aria-labelledby={`${id}-tab-${p.slug}`}
          hidden={i !== active}
          className={styles.panel}
        >
          {p.content}
        </div>
      ))}
    </div>
  );
}
