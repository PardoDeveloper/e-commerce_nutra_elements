"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { discountPercent, formatClp } from "@/lib/format";
import { searchProducts, type SearchEntry } from "@/lib/search";
import styles from "./SearchBox.module.css";

// Un solo pedido del índice por carga de página, compartido entre instancias.
let indexPromise: Promise<SearchEntry[]> | null = null;
function loadIndex(): Promise<SearchEntry[]> {
  indexPromise ??= fetch("/api/search-index")
    .then((r) => (r.ok ? (r.json() as Promise<SearchEntry[]>) : []))
    .catch(() => {
      indexPromise = null;
      return [];
    });
  return indexPromise;
}

interface SearchBoxProps {
  /** Se llama al elegir una sugerencia (por ejemplo, para cerrar el menú móvil). */
  onNavigate?: () => void;
  /** "hero": barra grande a todo el ancho bajo el carrusel del inicio, con el panel flotando debajo. */
  variant?: "header" | "hero";
  /** Texto de ejemplo del campo. */
  placeholder?: string;
}

/**
 * Buscador de la cabecera con sugerencias mientras se escribe (patrón combobox de WAI-ARIA).
 * Sin JavaScript sigue siendo un formulario GET a /productos?q=. El índice del catálogo se pide
 * al primer foco, no al cargar la página.
 */
export function SearchBox({ onNavigate, variant = "header", placeholder = "Buscar productos" }: SearchBoxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const router = useRouter();
  const rootRef = useRef<HTMLFormElement>(null);
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const results = useMemo(() => (index ? searchProducts(index, query) : []), [index, query]);
  const trimmed = query.trim();
  const showPanel = open && trimmed !== "" && index !== null;

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function prefetch() {
    if (!index) void loadIndex().then(setIndex);
  }

  function go(entry: SearchEntry) {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    router.push(`/productos/${entry.slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!showPanel || results.length === 0) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      // Recorre -1 (el campo de texto) y las sugerencias, en círculo.
      setActive((i) => {
        const next = i + step;
        if (next >= results.length) return -1;
        if (next < -1) return results.length - 1;
        return next;
      });
    } else if (e.key === "Enter" && showPanel && active >= 0 && active < results.length) {
      e.preventDefault();
      go(results[active]!);
    } else if (e.key === "Escape" && showPanel) {
      // Solo cierra las sugerencias; el menú móvil se cierra con un segundo Escape.
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <form
      ref={rootRef}
      action="/productos"
      method="get"
      role="search"
      className={`${styles.search} ${variant === "hero" ? styles.hero : ""}`}
      onSubmit={() => {
        setOpen(false);
        onNavigate?.();
      }}
    >
      <label htmlFor={`${id}-q`} className="visually-hidden">
        Buscar productos
      </label>
      <div className={styles.field}>
        {variant === "hero" ? (
          <svg className={styles.leadIcon} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M15 15l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : null}
        <input
          id={`${id}-q`}
          name="q"
          type="search"
          placeholder={placeholder}
          autoComplete="off"
          className={styles.input}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={showPanel && active >= 0 && active < results.length ? `${id}-opt-${active}` : undefined}
          value={query}
          onFocus={() => {
            prefetch();
            setOpen(true);
          }}
          onPointerEnter={prefetch}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className={styles.submit}>
          {variant === "hero" ? (
            <span className={styles.submitText}>Buscar</span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M15 15l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="visually-hidden">Buscar</span>
            </>
          )}
        </button>
      </div>

      <div className={`${styles.panel} ${showPanel ? styles.panelOpen : ""}`} hidden={!showPanel}>
        <ul id={listId} role="listbox" aria-label="Sugerencias de productos" className={styles.list}>
          {results.map((r, i) => {
            const percent = discountPercent(r.price, r.finalPrice);
            return (
              <li
                key={r.sku}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={styles.option}
                onPointerMove={() => setActive(i)}
              >
                <Link
                  href={`/productos/${r.slug}`}
                  className={styles.optionLink}
                  tabIndex={-1}
                  onClick={(e) => {
                    e.preventDefault();
                    go(r);
                  }}
                >
                  <span className={styles.thumb} aria-hidden="true">
                    <ProductImage name={r.name} categoryId={r.categoryId} alt="" image={r.image ? { url: r.image, alt: "" } : null} />
                  </span>
                  <span className={styles.info}>
                    <span className={styles.name}>
                      <Highlight text={r.name} query={trimmed} />
                    </span>
                    {r.inStock ? null : <span className={styles.stock}>Sin stock</span>}
                  </span>
                  <span className={styles.prices}>
                    {percent > 0 ? (
                      <>
                        <span className={styles.saleRow}>
                          <span className={styles.badge}>-{percent}%</span>
                          <span className={styles.sale}>
                            <span className="visually-hidden">Precio oferta: </span>
                            {formatClp(r.finalPrice)}
                          </span>
                        </span>
                        <s className={styles.old}>
                          <span className="visually-hidden">Precio normal: </span>
                          {formatClp(r.price)}
                        </s>
                      </>
                    ) : (
                      <span className={styles.current}>{formatClp(r.finalPrice)}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {results.length === 0 ? (
          <p className={styles.empty}>No encontramos productos para «{trimmed}».</p>
        ) : null}
        <button type="submit" className={styles.all}>
          Ver todos los resultados para «{trimmed}»
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">
        {showPanel ? `${results.length} ${results.length === 1 ? "sugerencia" : "sugerencias"}` : ""}
      </p>
    </form>
  );
}

/** Resalta en el nombre las partes que coinciden con la búsqueda (sin distinguir tildes). */
function Highlight({ text: raw, query }: { text: string; query: string }) {
  const text = raw.normalize("NFC");
  const terms = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return <>{text}</>;
  // Las letras con tilde se descomponen a una sola letra base, así que los índices coinciden con el texto original.
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const marks = new Array<boolean>(text.length).fill(false);
  for (const t of terms) {
    let from = 0;
    for (let at = plain.indexOf(t, from); at !== -1; at = plain.indexOf(t, from)) {
      for (let k = at; k < at + t.length; k++) marks[k] = true;
      from = at + t.length;
    }
  }
  const parts: Array<{ text: string; mark: boolean }> = [];
  for (let k = 0; k < text.length; k++) {
    const last = parts[parts.length - 1];
    if (last && last.mark === marks[k]) last.text += text[k];
    else parts.push({ text: text[k]!, mark: marks[k]! });
  }
  return (
    <>
      {parts.map((p, k) => (p.mark ? <mark key={k}>{p.text}</mark> : <span key={k}>{p.text}</span>))}
    </>
  );
}
