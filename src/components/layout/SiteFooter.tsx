import Image from "next/image";
import Link from "next/link";
import { getCategories, getPublicSettings } from "@/lib/data";
import styles from "./SiteFooter.module.css";

/** Pie global: retiro en tienda, enlaces informativos y legales, categorías y medios de pago. */
export async function SiteFooter() {
  const [settings, categories] = await Promise.all([getPublicSettings(), getCategories()]);
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <Image src="/brand/logo-icon.png" alt="" width={184} height={160} className={styles.logo} />
          <p className={styles.tagline}>Suplementos alimenticios para tu día a día.</p>
          <address className={styles.address}>
            <strong>Retiro en tienda</strong>
            <br />
            {settings.pickup.address}
            <br />
            {settings.pickup.hours}
          </address>
        </div>

        <nav aria-label="Tienda" className={styles.col}>
          <h2 className={styles.heading}>Tienda</h2>
          <ul className={styles.list}>
            <li>
              <Link href="/productos" className={styles.link}>
                Todos los productos
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/categorias/${c.slug}`} className={styles.link}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Información" className={styles.col}>
          <h2 className={styles.heading}>Información</h2>
          <ul className={styles.list}>
            <li>
              <Link href="/nosotros" className={styles.link}>
                Nosotros
              </Link>
            </li>
            <li>
              <Link href="/contacto" className={styles.link}>
                Contacto
              </Link>
            </li>
            <li>
              <Link href="/preguntas-frecuentes" className={styles.link}>
                Preguntas frecuentes
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Legales" className={styles.col}>
          <h2 className={styles.heading}>Legales</h2>
          <ul className={styles.list}>
            <li>
              <Link href="/terminos" className={styles.link}>
                Términos y condiciones
              </Link>
            </li>
            <li>
              <Link href="/privacidad" className={styles.link}>
                Política de privacidad
              </Link>
            </li>
            <li>
              <Link href="/cambios-y-devoluciones" className={styles.link}>
                Cambios y devoluciones
              </Link>
            </li>
          </ul>
        </nav>

        <div className={styles.col}>
          <h2 className={styles.heading}>Medios de pago</h2>
          <ul className={styles.payments}>
            <li className={styles.payment}>Flow</li>
            <li className={styles.payment}>Transferencia bancaria</li>
          </ul>
        </div>
      </div>
      <div className={styles.bottom}>
        <p>© {new Date().getFullYear()} Nutra Elements. Los suplementos alimenticios no son medicamentos.</p>
      </div>
    </footer>
  );
}
