"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./MainNav.module.css";
import { SearchBox } from "./SearchBox";

const LINKS = [
  { href: "/productos", label: "Productos" },
  { href: "/suscripcion", label: "Suscripción" },
  { href: "/nosotros", label: "Sobre nosotros" },
  { href: "/contacto", label: "Contáctanos" },
];

/**
 * Navegación principal. En móvil es un panel desplegable (botón con aria-expanded,
 * cierra con Escape o al elegir un enlace); desde 1100 px es una barra en línea.
 * Incluye el buscador con sugerencias (SearchBox; sin JavaScript es un formulario GET a /productos?q=).
 */
export function MainNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

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
        <SearchBox onNavigate={close} />
        <ul className={styles.list}>
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className={styles.link}
                onClick={close}
                aria-current={pathname === l.href || pathname.startsWith(`${l.href}/`) ? "page" : undefined}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
