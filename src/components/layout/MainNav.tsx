"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./MainNav.module.css";

interface MainNavProps {
  categories: Array<{ slug: string; name: string }>;
}

/**
 * Navegación principal. En móvil es un panel desplegable (botón con aria-expanded,
 * cierra con Escape o al elegir un enlace); desde 1100 px es una barra en línea.
 * Incluye el buscador (formulario GET a /productos?q=, funciona sin JavaScript).
 */
export function MainNav({ categories }: MainNavProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
          {open ? (
            <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
        <span className="visually-hidden">{open ? "Cerrar menú" : "Abrir menú"}</span>
      </button>

      <nav id={panelId} aria-label="Principal" className={`${styles.panel} ${open ? styles.open : ""}`}>
        <form action="/productos" method="get" role="search" className={styles.search}>
          <label htmlFor={`${panelId}-q`} className="visually-hidden">
            Buscar productos
          </label>
          <input
            id={`${panelId}-q`}
            name="q"
            type="search"
            placeholder="Buscar productos"
            autoComplete="off"
            className={styles.input}
          />
          <button type="submit" className={styles.submit}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M15 15l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="visually-hidden">Buscar</span>
          </button>
        </form>
        <ul className={styles.list}>
          <li>
            <Link href="/productos" className={styles.link} onClick={close}>
              Productos
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/categorias/${c.slug}`} className={styles.link} onClick={close}>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
