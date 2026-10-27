"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./HeroCarousel.module.css";

const AUTOPLAY_MS = 6000;

interface HeroCarouselProps {
  /**
   * Una entrada por diapositiva. La primera es la que se ve sin JavaScript (y el candidato a LCP).
   * Es una prop y no `children`: al cruzar de servidor a cliente los fragmentos se aplanan.
   */
  slides: ReactNode[];
  label: string;
}

/**
 * Carrusel del inicio. El desplazamiento es CSS (scroll-snap), así que funciona con el dedo o el
 * trackpad aunque el JS no cargue. El JS solo agrega los puntos, el avance automático y la pausa.
 * El avance automático se detiene con el puntero encima, con el foco dentro, con la pestaña oculta,
 * con "reducir movimiento" o con el botón de pausa (WCAG 2.2.2).
 */
export function HeroCarousel({ slides, label }: HeroCarouselProps) {
  const count = slides.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      track.scrollTo({
        left: index * track.clientWidth,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    },
    [reducedMotion],
  );

  // La diapositiva activa sale de la posición del scroll, así también la actualiza un deslizamiento manual.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () =>
      setActive(Math.round(track.scrollLeft / Math.max(track.clientWidth, 1)));
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  const autoplay =
    count > 1 && !paused && !hovered && !focused && !reducedMotion;
  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") goTo((active + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [autoplay, active, count, goTo]);

  return (
    <div
      className={styles.carousel}
      role="region"
      aria-roledescription="carrusel"
      aria-label={label}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <div
        ref={trackRef}
        className={styles.track}
        aria-live={autoplay ? "off" : "polite"}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className={styles.slide}
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${count}`}
            inert={i !== active}
          >
            {slide}
          </div>
        ))}
      </div>

      {count > 1 ? (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.pause}
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Reanudar el carrusel" : "Pausar el carrusel"}
          >
            <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
          </button>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={styles.dot}
              onClick={() => goTo(i)}
              aria-label={`Ir a la diapositiva ${i + 1}`}
              aria-current={i === active ? "true" : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
