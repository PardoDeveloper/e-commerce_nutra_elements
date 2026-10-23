"use client";

// Estructura del admin: banner fijo, barra lateral y control de sesión. Con "demo" la sesión es simulada (D-028);
// con "firebase" es la sesión real de Firebase Auth con el claim `admin` (D-031) y hace de guard de /admin/*
// en el cliente (la seguridad real está en las reglas y las Functions). Nada se renderiza en el servidor
// hasta conocer la sesión del navegador.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { DEMO_BANNER_PERSISTENT_TEXT, DEMO_BANNER_TEXT } from "@/lib/admin/config";
import {
  getServerSidebarCollapsed,
  getSidebarCollapsed,
  setSidebarCollapsed,
  subscribeSidebar,
} from "@/lib/admin/sidebar";
import { isDemoLoginAvailable } from "@/lib/admin/mode";
import { resolvePaymentsMode } from "@/lib/checkout/payments-mode";
import { getAuthSnapshot, getServerAuthSnapshot, signOutAdmin, subscribeAuth, type AuthState } from "@/lib/auth/admin-auth";
import { resetAdminService, useDataSource, useIsPersistent } from "./AdminProvider";
import { DataGate } from "./DataGate";
import { AdminIcon, type AdminIconName } from "./AdminIcons";
import {
  demoLogout,
  getServerSessionSnapshot,
  getSessionSnapshot,
  sessionEmail,
  subscribeSession,
} from "@/lib/admin/session";
import styles from "./AdminShell.module.css";

const NAV: readonly { href: string; label: string; icon: AdminIconName }[] = [
  { href: "/admin", label: "Resumen", icon: "home" },
  { href: "/admin/productos", label: "Productos", icon: "box" },
  { href: "/admin/importar", label: "Importar Excel", icon: "upload" },
  { href: "/admin/descuentos", label: "Descuentos", icon: "tag" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "orders" },
  { href: "/admin/ajustes", label: "Ajustes", icon: "settings" },
  { href: "/admin/perfil", label: "Mi perfil", icon: "user" },
];

const LOGIN_PATH = "/admin/login";
export const STAGING_BANNER_TEXT = "Staging: Flow en sandbox";
export const PRODUCTION_BANNER_TEXT = "Producción: los pagos con Flow son reales";

/** Sesión vista por el shell, igual para demo y Firebase. */
type SessionView = { status: "loading" } | { status: "out" } | { status: "in"; email: string };

const noopSubscribe = () => () => undefined;
const emptySession = () => "";
const LOADING_AUTH: AuthState = { status: "loading" };
const idleAuth = () => LOADING_AUTH;

/**
 * Lee la sesión de la fuente activa. Los dos `useSyncExternalStore` se llaman siempre (reglas de los hooks),
 * pero el de la fuente inactiva usa funciones vacías: con Firebase nunca se toca la sesión simulada.
 */
function useSessionView(demo: boolean): SessionView {
  const demoRaw = useSyncExternalStore(
    demo ? subscribeSession : noopSubscribe,
    demo ? getSessionSnapshot : emptySession,
    demo ? getServerSessionSnapshot : emptySession,
  );
  const auth = useSyncExternalStore(demo ? noopSubscribe : subscribeAuth, demo ? idleAuth : getAuthSnapshot, demo ? idleAuth : getServerAuthSnapshot);
  if (demo) {
    if (demoRaw === null) return { status: "loading" };
    return demoRaw ? { status: "in", email: sessionEmail(demoRaw) || "admin@demo" } : { status: "out" };
  }
  if (auth.status === "admin") return { status: "in", email: auth.email };
  if (auth.status === "signed-out") return { status: "out" };
  // "loading" y "verifying": en /admin/login el formulario sigue visible mientras se verifica (ver más abajo).
  return { status: "loading" };
}

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const persistent = useIsPersistent();
  const pathname = usePathname();
  const router = useRouter();
  const dataSource = useDataSource();
  const demo = isDemoLoginAvailable(dataSource);
  const session = useSessionView(demo);
  const authState = useSyncExternalStore(demo ? noopSubscribe : subscribeAuth, demo ? idleAuth : getAuthSnapshot, demo ? idleAuth : getServerAuthSnapshot);
  const [menuOpen, setMenuOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, getSidebarCollapsed, getServerSidebarCollapsed);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const onLogin = pathname === LOGIN_PATH;

  // Cierra el panel móvil; con returnFocus el foco vuelve al botón que lo abrió.
  const closeMenu = useCallback((returnFocus: boolean) => {
    setMenuOpen(false);
    if (returnFocus) menuButtonRef.current?.focus();
  }, []);

  // Al abrir el panel móvil, el foco pasa al enlace de la sección activa (o al primero).
  useEffect(() => {
    if (!menuOpen) return;
    const nav = navRef.current;
    nav?.querySelector<HTMLElement>('a[aria-current="page"], a')?.focus();
  }, [menuOpen]);

  useEffect(() => {
    if (session.status === "loading") return;
    if (session.status === "out" && !onLogin) router.replace(LOGIN_PATH);
    if (session.status === "in" && onLogin) router.replace("/admin");
  }, [session.status, onLogin, router]);

  // Al cerrar la sesión real se descartan los listeners de Firestore y los datos en memoria.
  useEffect(() => {
    if (!demo && session.status === "out") resetAdminService();
  }, [demo, session.status]);

  const banner = (
    <div className={styles.banner} role="status">
      {demo ? (persistent ? DEMO_BANNER_PERSISTENT_TEXT : DEMO_BANNER_TEXT) : resolvePaymentsMode(dataSource) === "sandbox" ? STAGING_BANNER_TEXT : PRODUCTION_BANNER_TEXT}
    </div>
  );

  // En el login real el formulario se muestra aun mientras se verifican los permisos (ahí vive el aviso).
  if (!demo && onLogin && authState.status !== "admin") {
    return (
      <div className={styles.root} data-admin-root>
        {banner}
        <div className={styles.centered}>{authState.status === "loading" ? <p role="status">Cargando…</p> : children}</div>
      </div>
    );
  }

  if (session.status === "loading") {
    return (
      <div className={styles.root} data-admin-root>
        {banner}
        <p className={styles.status} role="status">
          Cargando el panel…
        </p>
      </div>
    );
  }

  if (onLogin) {
    return (
      <div className={styles.root} data-admin-root>
        {banner}
        <div className={styles.centered}>{session.status === "in" ? <p role="status">Entrando al panel…</p> : children}</div>
      </div>
    );
  }

  if (session.status === "out") {
    return (
      <div className={styles.root} data-admin-root>
        {banner}
        <p className={styles.status} role="status">
          Redirigiendo al inicio de sesión…
        </p>
      </div>
    );
  }

  const email = session.email;

  return (
    <div
      className={styles.root}
      data-admin-root
      onKeyDown={(e) => {
        if (e.key === "Escape" && menuOpen) closeMenu(true);
      }}
    >
      {banner}
      <div className={styles.topbar}>
        <Link href="/admin" className={styles.brand}>
          Nutra Elements · Admin
        </Link>
        <button
          type="button"
          ref={menuButtonRef}
          className={styles.menuButton}
          aria-expanded={menuOpen}
          aria-controls="admin-nav"
          onClick={() => (menuOpen ? closeMenu(true) : setMenuOpen(true))}
        >
          <AdminIcon name="menu" />
          <span aria-hidden="true">Menú</span>
          <span className="visually-hidden">{menuOpen ? "Ocultar menú" : "Mostrar menú"}</span>
        </button>
      </div>
      {menuOpen ? <div className={styles.scrim} onClick={() => closeMenu(true)} aria-hidden="true" /> : null}
      <div className={`${styles.body} ${collapsed ? styles.bodyCollapsed : ""}`}>
        <nav
          id="admin-nav"
          ref={navRef}
          aria-label="Administración"
          className={`${styles.nav} ${menuOpen ? styles.navOpen : ""} ${collapsed ? styles.navCollapsed : ""}`}
        >
          <div>
            <button
              type="button"
              className={styles.collapseButton}
              aria-expanded={!collapsed}
              aria-controls="admin-nav"
              title={collapsed ? "Mostrar menú" : "Ocultar menú"}
              onClick={() => setSidebarCollapsed(!collapsed)}
            >
              <AdminIcon name={collapsed ? "expand" : "collapse"} />
              <span className={styles.label}>{collapsed ? "Mostrar menú" : "Ocultar menú"}</span>
            </button>
            <p className={styles.navTitle}>Admin</p>
            <ul className={styles.navList}>
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={styles.navLink}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    aria-label={item.label}
                    title={collapsed ? item.label : undefined}
                    onClick={() => closeMenu(true)}
                  >
                    <AdminIcon name={item.icon} />
                    <span className={styles.label}>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.navFooter}>
            <p className={`${styles.user} ${styles.label}`}>{demo ? `Sesión simulada: ${email}` : email}</p>
            <button
              type="button"
              className={styles.logout}
              aria-label="Salir"
              title={collapsed ? "Salir" : undefined}
              onClick={() => {
                if (demo) demoLogout();
                else void signOutAdmin();
                router.replace(LOGIN_PATH);
              }}
            >
              <AdminIcon name="logout" />
              <span className={styles.label}>Salir</span>
            </button>
          </div>
        </nav>
        <div className={`${styles.content} ${collapsed ? styles.contentWide : ""}`}>
          <DataGate>{children}</DataGate>
        </div>
      </div>
    </div>
  );
}
