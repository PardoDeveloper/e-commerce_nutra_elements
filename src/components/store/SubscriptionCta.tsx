import Link from "next/link";
import { SUBSCRIPTION_PAGE, subscriptionUrl } from "@/lib/subscription";
import styles from "./SubscriptionCta.module.css";

function CalendarIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 15l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalArrow() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M7 17L17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Enlace al formulario externo de suscripción: pestaña nueva para no perder el carrito. */
export function SubscribeLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className={className}>
      {children}
      <ExternalArrow />
      <span className="visually-hidden"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

/** Tarjeta bajo «Agregar al carrito» en la ficha de producto (D-048). */
export function SubscriptionCard({ productSlug }: { productSlug: string }) {
  return (
    <aside className={styles.card} aria-labelledby="suscripcion-ficha">
      <span className={styles.cardIcon}>
        <CalendarIcon size={22} />
      </span>
      <div className={styles.cardBody}>
        <p id="suscripcion-ficha" className={styles.cardTitle}>
          ¿Lo tomas todos los meses?
        </p>
        <p className={styles.cardText}>Resérvalo con la suscripción mensual y tenlo siempre disponible.</p>
        <div className={styles.cardActions}>
          <SubscribeLink href={subscriptionUrl("ficha", productSlug)} className={styles.cardCta}>
            Suscribirme
          </SubscribeLink>
          <Link href={SUBSCRIPTION_PAGE} className={styles.cardMore}>
            ¿Cómo funciona?
          </Link>
        </div>
      </div>
    </aside>
  );
}

/** Franja de la página de inicio (D-048). */
export function SubscriptionBand() {
  return (
    <section className={styles.band} aria-labelledby="home-suscripcion">
      <span className={styles.bandIcon}>
        <CalendarIcon size={34} />
      </span>
      <div className={styles.bandBody}>
        <p className={styles.eyebrow}>Nuevo · Suscripción mensual</p>
        <h2 id="home-suscripcion" className={styles.bandTitle}>
          Reserva tus suplementos cada mes y nunca te quedes sin ellos
        </h2>
        <p className={styles.bandText}>
          Elige los productos que usas siempre, resérvalos mensualmente y olvídate de recordar la compra.
        </p>
      </div>
      <div className={styles.bandActions}>
        <SubscribeLink href={subscriptionUrl("inicio")} className={styles.bandCta}>
          Suscribirme
        </SubscribeLink>
        <Link href={SUBSCRIPTION_PAGE} className={styles.bandMore}>
          Cómo funciona
        </Link>
      </div>
    </section>
  );
}
