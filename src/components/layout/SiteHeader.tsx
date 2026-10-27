import Image from "next/image";
import Link from "next/link";
import { CartLink } from "./CartLink";
import { MainNav } from "./MainNav";
import styles from "./SiteHeader.module.css";

/** Cabecera global: logo (ícono + texto) enlazado a "/", navegación, buscador y carrito. */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="Nutra Elements, ir al inicio">
          <Image src="/brand/logo-icon.png" alt="" width={184} height={160} priority className={styles.icon} />
          <Image src="/brand/logo-text.png" alt="" width={450} height={120} priority className={styles.text} />
        </Link>
        <MainNav />
        <CartLink />
      </div>
    </header>
  );
}
