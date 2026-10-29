import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { Button } from "@/components/Button";
import { CategoryCard } from "@/components/CategoryCard";
import { Container } from "@/components/Container";
import { ProductCard } from "@/components/ProductCard";
import { SectionHeading } from "@/components/SectionHeading";
import { CategoryCarousel } from "@/components/store/CategoryCarousel";
import { HeroCarousel } from "@/components/store/HeroCarousel";
import { HomeFaq } from "@/components/store/HomeFaq";
import { JsonLd } from "@/components/store/JsonLd";
import styles from "@/components/store/store.module.css";
import { getCategories, getProducts, getPublicSettings } from "@/lib/data";
import { pickFeatured } from "@/lib/featured";
import { formatClp } from "@/lib/format";
import { faqPageNode, graph, organizationNode, pageMetadata, websiteNode } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Nutra Elements | Suplementos en cápsulas, Puente Alto y RM",
  description:
    "Vitaminas, minerales, omega 3 y más en cápsulas, de marca propia. Despacho a toda la RM por $3.990 y retiro en tienda en Puente Alto.",
  path: "/",
});

export default async function HomePage() {
  const [categories, products, settings] = await Promise.all([
    getCategories(),
    getProducts(),
    getPublicSettings(),
  ]);
  const featured = pickFeatured(products);
  const counts = new Map<string, number>();
  for (const p of products) if (p.categoryId) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  const categoryNames = new Map(categories.map((c) => [c.slug as string, c.name]));

  return (
    <Container as="div" className={styles.page}>
      <JsonLd data={graph(organizationNode(), websiteNode(), faqPageNode())} />

      <section className={styles.hero} aria-labelledby="home-titulo">
        {/* El banner trae el logo y el lema dentro de la imagen. El H1 queda solo para lectores de pantalla y buscadores. */}
        <h1 id="home-titulo" className={styles.srOnly}>
          Nutra Elements: suplementos en cápsulas de marca propia
        </h1>
        <HeroCarousel
          label="Destacados de Nutra Elements"
          slides={[
            <Fragment key="banner-1">
              <Image
                src="/banner_2.png"
                alt="Nutra Elements: pureza en cada detalle. Manos sosteniendo romero fresco sobre mármol."
                width={2006}
                height={784}
                priority
                fetchPriority="high"
                quality={75}
                sizes="100vw"
                className={`${styles.heroImage} ${styles.heroImageAlt}`}
              />
              <div className={styles.heroActions}>
                <Button href="/productos" size="lg" className={styles.heroCta}>
                  Ver catálogo
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Button>
              </div>
            </Fragment>,
          ]}
        />
      </section>

      <section className={styles.block} aria-labelledby="home-categorias">
        <SectionHeading id="home-categorias" title="Compra por categoría" />
        <CategoryCarousel label="Categorías">
          {categories.map((c) => (
            <li key={c.slug}>
              <CategoryCard category={c} productCount={counts.get(c.slug) ?? 0} />
            </li>
          ))}
        </CategoryCarousel>
      </section>

      {featured.length > 0 ? (
        <section className={styles.block} aria-labelledby="home-destacados">
          <SectionHeading
            id="home-destacados"
            title="Productos destacados"
            action={
              <Link href="/productos" className={styles.inlineLink}>
                Ver todo el catálogo
              </Link>
            }
          />
          <ul className="product-grid">
            {featured.map((p) => (
              <li key={p.sku}>
                <ProductCard product={p} categoryName={p.categoryId ? categoryNames.get(p.categoryId) : undefined} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.block} aria-labelledby="home-despacho">
        <SectionHeading id="home-despacho" title="Despacho en la RM y retiro en tienda en Puente Alto" />
        <div className={styles.text}>
          <p>
            Despachamos a toda la Región Metropolitana por {formatClp(settings.shippingFee)}. También puedes retirar tu
            pedido en {settings.pickup.address}: {settings.pickup.hours.toLowerCase()}. Más detalles en{" "}
            <a href="#preguntas-frecuentes">preguntas frecuentes</a>.
          </p>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="home-beneficios">
        <SectionHeading id="home-beneficios" title="Por qué Nutra Elements" />
        <ul className={styles.benefits}>
          <li className={styles.benefit}>
            <h3>Retiro en Puente Alto</h3>
            <p>Retira tu pedido en la tienda, de lunes a viernes, sin costo de despacho.</p>
          </li>
          <li className={styles.benefit}>
            <h3>Despacho en la RM</h3>
            <p>Llegamos a las comunas de la Región Metropolitana por {formatClp(settings.shippingFee)}.</p>
          </li>
          <li className={styles.benefit}>
            <h3>Paga en línea con Flow</h3>
            <p>Pagas a través de Flow al finalizar tu compra.</p>
          </li>
        </ul>
        <p className={styles.text}>
          Conoce <Link href="/nosotros">quiénes somos</Link> o escríbenos desde <Link href="/contacto">contacto</Link>.
        </p>
      </section>

      <HomeFaq />
    </Container>
  );
}
