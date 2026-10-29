import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { JsonLd } from "@/components/store/JsonLd";
import styles from "@/components/store/store.module.css";
import { getCategories, getPublicSettings } from "@/lib/data";
import { formatClp } from "@/lib/format";
import { absoluteUrl, breadcrumbList, graph, orgId, pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

// Ubicación de la tienda (pin de Google Maps). El mapa embebido no requiere API key.
const STORE_COORDS = "-33.610227,-70.5759595";
const MAP_EMBED_URL = `https://maps.google.com/maps?q=${STORE_COORDS}&z=17&hl=es&output=embed`;
const MAP_LINK_URL = `https://www.google.com/maps/search/?api=1&query=${STORE_COORDS}`;

export const metadata = pageMetadata({
  title: "Quiénes somos | Nutra Elements",
  description:
    "Conoce Nutra Elements, marca propia de suplementos, con tienda para retiro en Puente Alto y despacho en toda la RM.",
  path: "/nosotros",
});

export default async function AboutPage() {
  const [categories, settings] = await Promise.all([getCategories(), getPublicSettings()]);
  return (
    <Container as="div" size="narrow" className={styles.page}>
      <JsonLd
        data={graph(
          {
            "@type": "AboutPage",
            name: "Quiénes somos",
            url: absoluteUrl("/nosotros"),
            inLanguage: "es-CL",
            about: { "@id": orgId() },
          },
          breadcrumbList([{ name: "Inicio", path: "/" }, { name: "Quiénes somos" }]),
        )}
      />
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Quiénes somos" }]} />
      <header className={styles.pageHead}>
        <h1>Quiénes somos</h1>
        <p className={styles.lead}>
          En Nutra Elements creemos que el bienestar verdadero nace del equilibrio natural y el cuidado consciente de la salid. Somos una Marca de suplementos alimenticios, comprometida con ofrecer formulas con altos estándares de calidad, seguridad y pureza.
          <br />
          Nuestro proposito es acompañarte en tu día a día a través de soluciones confiables, incluyendo nuestras vitaminas y minerales esenciales, diseñadas para potenciar tu vitalidad, complementar tus tratamientos y mejorar tu calidad de vida.
          <br />
          Descubre nuestra línea de suplementos y da el primer paso hacia una vida más saludable.
        </p>
      </header>

      <section className={styles.block} aria-labelledby="nos-marca">
        <h2 id="nos-marca">Nuestra marca</h2>
        <div className={styles.text}>
          <p>
            Ofrecemos un catálogo de vitaminas, magnesio, minerales, omega 3, productos de belleza y suplementos
            funcionales. Cada producto tiene su ficha con presentación, contenido y precio, y puedes
            revisar el detalle completo en el rótulo del frasco.
          </p>
          <p>
            Nuestros productos son suplementos alimentarios: no reemplazan una alimentación variada y equilibrada. Ante
            cualquier duda sobre su uso, consulta a un profesional de la salud.
          </p>
        
        </div>
      </section>

      <section className={styles.block} aria-labelledby="nos-donde">
        <h2 id="nos-donde">Dónde estamos</h2>
        <div className={styles.text}>
          <p>
            Nuestra tienda está en {settings.pickup.address}. Puedes retirar tu pedido ahí: {settings.pickup.hours.toLowerCase()} hrs.
            Revisa cómo llegar y los datos de contacto en <Link href="/contacto">retiro en tienda en Puente Alto</Link>.
          </p>
        </div>
        <iframe
          className={styles.map}
          src={MAP_EMBED_URL}
          title={`Mapa: tienda Nutra Elements en ${settings.pickup.address}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
        <p className={styles.meta}>
          <a href={MAP_LINK_URL} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
            Abrir en Google Maps
          </a>
        </p>
      </section>

      <section className={styles.block} aria-labelledby="nos-como">
        <h2 id="nos-como">Cómo trabajamos</h2>
        <div className={styles.text}>
          <p>
            Despachamos con medios propios a toda la Región Metropolitana por {formatClp(settings.shippingFee)}. Puedes
            pagar en línea con Flow. Si tienes dudas sobre despacho, retiro o pagos, revisa las{" "}
            <Link href="/#preguntas-frecuentes">preguntas frecuentes</Link> o mira todo el{" "}
            <Link href="/productos">catálogo</Link>.
          </p>
        </div>
      </section>
    </Container>
  );
}
