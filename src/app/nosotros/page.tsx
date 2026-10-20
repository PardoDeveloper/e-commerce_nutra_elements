import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { JsonLd } from "@/components/store/JsonLd";
import styles from "@/components/store/store.module.css";
import { getCategories, getPublicSettings } from "@/lib/data";
import { formatClp } from "@/lib/format";
import { absoluteUrl, breadcrumbList, graph, orgId, pageMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Quiénes somos | Nutra Elements",
  description:
    "Conoce Nutra Elements, marca propia de suplementos alimentarios en cápsulas, con tienda para retiro en Puente Alto y despacho en toda la RM.",
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
          Nutra Elements es una marca propia de suplementos alimentarios en cápsulas, con tienda en Puente Alto.
        </p>
      </header>

      <section className={styles.block} aria-labelledby="nos-marca">
        <h2 id="nos-marca">Nuestra marca</h2>
        <div className={styles.text}>
          <p>
            Ofrecemos un catálogo de vitaminas, magnesio, minerales, omega 3, productos de belleza y suplementos
            funcionales, todos en cápsulas. Cada producto tiene su ficha con presentación, contenido y precio, y puedes
            revisar el detalle completo en el rótulo del frasco.
          </p>
          <p>
            Nuestros productos son suplementos alimentarios: no reemplazan una alimentación variada y equilibrada. Ante
            cualquier duda sobre su uso, consulta a un profesional de la salud.
          </p>
          <p>Explora el catálogo por categoría:</p>
        </div>
        <ul className={styles.linkList}>
          {categories.map((c) => (
            <li key={c.slug}>
              <Link href={`/categorias/${c.slug}`}>{c.name}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block} aria-labelledby="nos-donde">
        <h2 id="nos-donde">Dónde estamos</h2>
        <div className={styles.text}>
          <p>
            Nuestra tienda está en {settings.pickup.address}. Puedes retirar tu pedido ahí: {settings.pickup.hours.toLowerCase()}.
            Revisa cómo llegar y los datos de contacto en <Link href="/contacto">retiro en tienda en Puente Alto</Link>.
          </p>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="nos-como">
        <h2 id="nos-como">Cómo trabajamos</h2>
        <div className={styles.text}>
          <p>
            Despachamos con medios propios a toda la Región Metropolitana por {formatClp(settings.shippingFee)}. Puedes
            pagar con Flow o por transferencia bancaria. Si tienes dudas sobre despacho, retiro o pagos, revisa las{" "}
            <Link href="/preguntas-frecuentes">preguntas frecuentes</Link> o mira todo el{" "}
            <Link href="/productos">catálogo</Link>.
          </p>
        </div>
      </section>
    </Container>
  );
}
