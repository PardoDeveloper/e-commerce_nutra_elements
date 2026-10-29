import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { ContactForm } from "@/components/store/ContactForm";
import { JsonLd } from "@/components/store/JsonLd";
import contact from "@/components/store/contact.module.css";
import styles from "@/components/store/store.module.css";
import { getPublicSettings } from "@/lib/data";
import { resolveDataSource } from "@/lib/data-source";
import { formatClp } from "@/lib/format";
import { absoluteUrl, breadcrumbList, graph, MAPS_URL, orgId, pageMetadata, STORE_ADDRESS, storeId } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Contacto y retiro en tienda en Puente Alto | Nutra Elements",
  description:
    "Retira tu pedido en Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00, o contáctanos. Despacho a toda la RM por $3.990.",
  path: "/contacto",
});

/** Ícono de línea decorativo de las tarjetas de información. */
function Icon({ d }: { d: string[] }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export default async function ContactPage() {
  const settings = await getPublicSettings();
  // Teléfono, correo, redes, geo y código postal son PENDIENTE: no se muestran ni se marcan.
  return (
    <Container as="div" className={styles.page}>
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
        <p className={styles.lead}>¿Tienes dudas sobre un producto o tu pedido? Escríbenos y te responderemos a la brevedad.</p>
      </header>

      <div className={contact.layout}>
        <section className={contact.formCard} aria-labelledby="con-escribenos">
          <h2 id="con-escribenos">Escríbenos</h2>
          <p className={contact.formIntro}>Completa el formulario y te responderemos por correo.</p>
          <ContactForm dataSource={resolveDataSource()} />
        </section>

        <aside className={contact.aside} aria-label="Información de la tienda">
          <section className={contact.infoCard} aria-labelledby="con-retiro">
            <span className={contact.infoIcon} aria-hidden="true">
              <Icon d={["M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z", "M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"]} />
            </span>
            <div>
              <h2 id="con-retiro">Retiro en tienda en Puente Alto</h2>
              <address>
                {settings.pickup.address}
                <br />
                Región Metropolitana, Chile
              </address>
              <a className={contact.mapLink} href={MAPS_URL} target="_blank" rel="noopener noreferrer">
                Ver en Google Maps<span className="visually-hidden"> (se abre en una pestaña nueva)</span>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
                  <path d="M14 5h5v5M19 5l-8 8M10 6H5v13h13v-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          </section>

          <section className={contact.infoCard} aria-labelledby="con-horario">
            <span className={contact.infoIcon} aria-hidden="true">
              <Icon d={["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"]} />
            </span>
            <div>
              <h2 id="con-horario">Horario de atención</h2>
              <p>{settings.pickup.hours} hrs.</p>
              <p>Para retirar, indica tu número de pedido (formato NE-xxxxxx).</p>
            </div>
          </section>

          <section className={contact.infoCard} aria-labelledby="con-despacho">
            <span className={contact.infoIcon} aria-hidden="true">
              <Icon d={["M3 6h11v10H3z", "M14 9h4l3 3v4h-7", "M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"]} />
            </span>
            <div>
              <h2 id="con-despacho">Despacho en la Región Metropolitana</h2>
              <p>
                Despachamos a toda la RM por {formatClp(settings.shippingFee)}. Revisa los detalles en{" "}
                <Link href="/#preguntas-frecuentes">preguntas frecuentes</Link>.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </Container>
  );
}
