"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./CategoryCarousel.module.css";

interface CategoryCarouselProps {
  /** Los <li> de la lista; se renderizan en el servidor, así los enlaces existen sin JavaScript. */
  children: ReactNode;
  label: string;
}

/**
 * Fila de categorías del inicio. Si no caben todas, se desplaza a los lados con scroll-snap
 * (dedo, trackpad o rueda), sin depender del JS. El JS solo agrega las flechas y el difuminado de
 * los bordes, y los oculta cuando todo cabe en pantalla.
 */
export function CategoryCarousel({ children, label }: CategoryCarouselProps) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      // 1 px de tolerancia: el zoom del navegador deja scrollLeft con decimales.
      setCanPrev(track.scrollLeft > 1);
      setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 1);
    };
    update();
    track.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const scrollByPage = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    // El destino es siempre el inicio de una tarjeta: un desplazamiento arbitrario choca con el scroll-snap
    // y el navegador puede devolverlo a la posición anterior.
    const origin = track.getBoundingClientRect().left - track.scrollLeft;
    const cards = Array.from(track.children, (li) => ({ left: li.getBoundingClientRect().left - origin, width: li.clientWidth }));
    const starts = cards.map((c) => c.left);
    const { scrollLeft, clientWidth } = track;
    const target =
      direction === 1
        ? // La primera tarjeta cortada a la derecha pasa a ser la primera visible.
          (cards.find((c) => c.left + c.width > scrollLeft + clientWidth + 1)?.left ?? scrollLeft)
        : // Retrocede una pantalla, alineado a la tarjeta más cercana a ese punto.
          starts.reduce((best, left) => (Math.abs(left - (scrollLeft - clientWidth)) < Math.abs(best - (scrollLeft - clientWidth)) ? left : best), 0);
    const max = track.scrollWidth - clientWidth;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: Math.min(Math.max(target, 0), max), behavior: reduced ? "auto" : "smooth" });
  }, []);

  const overflow = canPrev || canNext;

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="carrusel"
      aria-label={label}
      data-fade-start={canPrev || undefined}
      data-fade-end={canNext || undefined}
    >
      <ul ref={trackRef} className={styles.track}>
        {children}
      </ul>
      {overflow ? (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.prev}`}
            onClick={() => scrollByPage(-1)}
            disabled={!canPrev}
            aria-label="Ver categorías anteriores"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.next}`}
            onClick={() => scrollByPage(1)}
            disabled={!canNext}
            aria-label="Ver más categorías"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );
}
