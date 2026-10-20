import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { JsonLd } from "@/components/store/JsonLd";
import styles from "@/components/store/store.module.css";
import { getPublicSettings } from "@/lib/data";
import { formatClp } from "@/lib/format";
import { absoluteUrl, breadcrumbList, graph, MAPS_URL, orgId, pageMetadata, STORE_ADDRESS, storeId } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Contacto y retiro en tienda en Puente Alto | Nutra Elements",
  description:
    "Retira tu pedido en Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00, o contáctanos. Despacho a toda la RM por $3.990.",
  path: "/contacto",
});

export default async function ContactPage() {
  const settings = await getPublicSettings();
  // Teléfono, correo, redes, geo y código postal son PENDIENTE: no se muestran ni se marcan.
  return (
    <Container as="div" size="narrow" className={styles.page}>
      <JsonLd
        data={graph(
          {
            "@type": "Store",
            "@id": storeId(),
            name: "Nutra Elements",
            url: absoluteUrl("/"),
            parentOrganization: { "@id": orgId() },
            address: {
              "@type": "PostalAddress",
              streetAddress: STORE_ADDRESS.street,
              addressLocality: STORE_ADDRESS.locality,
              addressRegion: STORE_ADDRESS.region,
              addressCountry: STORE_ADDRESS.country,
            },
            openingHoursSpecification: [
              {
                "@type": "OpeningHoursSpecification",
                dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                opens: "09:00",
                closes: "20:00",
              },
            ],
            areaServed: { "@type": "AdministrativeArea", name: STORE_ADDRESS.region },
          },
          breadcrumbList([{ name: "Inicio", path: "/" }, { name: "Contacto" }]),
        )}
      />
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Contacto" }]} />
      <header className={styles.pageHead}>
        <h1>Contacto y retiro en tienda</h1>
        <p className={styles.lead}>Retira tu pedido en Puente Alto o escríbenos si necesitas ayuda.</p>
      </header>

      <section className={styles.block} aria-labelledby="con-retiro">
        <h2 id="con-retiro">Retiro en tienda en Puente Alto</h2>
        <address className={styles.address}>
          {settings.pickup.address}
          <br />
          Región Metropolitana, Chile
        </address>
        <div className={styles.text}>
          <p>{settings.pickup.hours}.</p>
          <p>Para retirar, indica tu número de pedido (formato NE-xxxxxx).</p>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="con-despacho">
        <h2 id="con-despacho">Despacho en la Región Metropolitana</h2>
        <div className={styles.text}>
          <p>
            Despachamos a toda la RM por {formatClp(settings.shippingFee)}. Revisa los detalles en{" "}
            <Link href="/preguntas-frecuentes">preguntas frecuentes</Link>.
          </p>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="con-escribenos">
        <h2 id="con-escribenos">Escríbenos</h2>
        <form className={styles.formBox} aria-describedby="con-proto">
          <p id="con-proto" className={styles.draft} role="note">
            Prototipo: el formulario aún no envía mensajes.
          </p>
          <div className={styles.field}>
            <label htmlFor="con-nombre">Nombre</label>
            <input id="con-nombre" name="nombre" type="text" autoComplete="name" disabled />
          </div>
          <div className={styles.field}>
            <label htmlFor="con-mensaje">Mensaje</label>
            <textarea id="con-mensaje" name="mensaje" rows={4} disabled />
          </div>
        </form>
      </section>

      <section className={styles.block} aria-labelledby="con-llegar">
        <h2 id="con-llegar">Cómo llegar</h2>
        <div className={styles.text}>
          <p>
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              Ver {settings.pickup.address} en Google Maps (se abre en una pestaña nueva)
            </a>
          </p>
        </div>
      </section>
    </Container>
  );
}
