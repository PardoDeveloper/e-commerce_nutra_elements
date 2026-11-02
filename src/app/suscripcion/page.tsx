import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { JsonLd } from "@/components/store/JsonLd";
import styles from "@/components/store/store.module.css";
import cta from "@/components/store/SubscriptionCta.module.css";
import { SubscribeLink } from "@/components/store/SubscriptionCta";
import { absoluteUrl, breadcrumbList, graph, orgId, pageMetadata } from "@/lib/seo";
import { SUBSCRIPTION_PAGE, SUBSCRIPTION_URL, subscriptionUrl } from "@/lib/subscription";

export const revalidate = 3600;

const TITLE = "Suscripción mensual";

export const metadata = pageMetadata({
  title: "Suscripción mensual de suplementos | Nutra Elements",
  description:
    "Reserva cada mes tus suplementos Nutra Elements con la suscripción mensual y tenlos siempre disponibles. Inscríbete en minutos.",
  path: SUBSCRIPTION_PAGE,
});

/** Página propia de la suscripción (D-048): explica cómo funciona y lleva al formulario externo. */
export default function SubscriptionPage() {
  const formHost = new URL(SUBSCRIPTION_URL).host;
  return (
    <Container as="div" size="narrow" className={styles.page}>
      <JsonLd
        data={graph(
          {
            "@type": "WebPage",
            name: TITLE,
            url: absoluteUrl(SUBSCRIPTION_PAGE),
            inLanguage: "es-CL",
            publisher: { "@id": orgId() },
          },
          breadcrumbList([{ name: "Inicio", path: "/" }, { name: TITLE }]),
        )}
      />
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: TITLE }]} />
      <header className={styles.pageHead}>
        <h1>Suscripción mensual: reserva tus suplementos cada mes</h1>
        <p className={styles.lead}>
          Si usas siempre los mismos productos, suscríbete y resérvalos mensualmente. Así sabes que siempre los tendrás
          disponibles, sin tener que acordarte de comprar.
        </p>
        <p className={styles.subscribeTop}>
          <SubscribeLink href={subscriptionUrl("pagina")} className={cta.bandCta}>
            Suscribirme ahora
          </SubscribeLink>
        </p>
      </header>

      <section className={styles.block} aria-labelledby="sus-como">
        <h2 id="sus-como">Cómo funciona</h2>
        <ol className={styles.steps}>
          <li className={styles.benefit}>
            <h3>1. Ingresa tu correo</h3>
            <p>Ahí te llegan la cotización y los detalles de tu suscripción.</p>
          </li>
          <li className={styles.benefit}>
            <h3>2. Elige tus productos</h3>
            <p>Selecciona los suplementos que quieres reservar cada mes.</p>
          </li>
          <li className={styles.benefit}>
            <h3>3. Completa tus datos</h3>
            <p>Confirma los detalles y tu suscripción queda registrada.</p>
          </li>
        </ol>
      </section>

      <section className={styles.block} aria-labelledby="sus-beneficios">
        <h2 id="sus-beneficios">Por qué suscribirte</h2>
        <ul className={styles.benefits}>
          <li className={styles.benefit}>
            <h3>Producto reservado</h3>
            <p>Tus productos quedan apartados para ti cada mes.</p>
          </li>
          <li className={styles.benefit}>
            <h3>Siempre disponible</h3>
            <p>No te quedas sin tu suplemento por falta de stock.</p>
          </li>
          <li className={styles.benefit}>
            <h3>Sin recordatorios</h3>
            <p>Te olvidas de tener que repetir la compra todos los meses.</p>
          </li>
        </ul>
      </section>

      <section className={styles.block} aria-labelledby="sus-donde">
        <h2 id="sus-donde">Dónde te inscribes</h2>
        <div className={styles.text}>
          <p>
            La inscripción se hace en un formulario externo, en <strong>{formHost}</strong>, que se abre en una pestaña
            nueva. Si tienes dudas antes de suscribirte, escríbenos desde <Link href="/contacto">contacto</Link> o revisa
            el <Link href="/productos">catálogo</Link> para elegir tus productos.
          </p>
          <p>Son suplementos alimentarios: no reemplazan una alimentación variada y equilibrada.</p>
        </div>
        <p>
          <SubscribeLink href={subscriptionUrl("pagina")} className={cta.bandCta}>
            Ir al formulario de suscripción
          </SubscribeLink>
        </p>
      </section>
    </Container>
  );
}
