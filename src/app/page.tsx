import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/Button";
import { CategoryCard } from "@/components/CategoryCard";
import { Container } from "@/components/Container";
import { ProductCard } from "@/components/ProductCard";
import { SectionHeading } from "@/components/SectionHeading";
import { JsonLd } from "@/components/store/JsonLd";
import styles from "@/components/store/store.module.css";
import { getCategories, getProducts, getPublicSettings } from "@/lib/data";
import type { Product } from "@/lib/data";
import { formatClp } from "@/lib/format";
import { graph, organizationNode, pageMetadata, websiteNode } from "@/lib/seo";

export const revalidate = 3600;

export const metadata = pageMetadata({
  title: "Nutra Elements | Suplementos en cápsulas, Puente Alto y RM",
  description:
    "Vitaminas, minerales, omega 3 y más en cápsulas, de marca propia. Despacho a toda la RM por $3.990 y retiro en tienda en Puente Alto.",
  path: "/",
});

/** Destacados: el primer producto con stock de cada categoría y luego completa hasta 8. */
function pickFeatured(products: Product[], categoryOrder: string[]): Product[] {
  const picked: Product[] = [];
  for (const cat of categoryOrder) {
    const first = products.find((p) => p.categoryId === cat && p.inStock);
    if (first) picked.push(first);
  }
  for (const p of products) {
    if (picked.length >= 8) break;
    if (p.inStock && !picked.includes(p)) picked.push(p);
  }
  return picked;
}

export default async function HomePage() {
  const [categories, products, settings] = await Promise.all([
    getCategories(),
    getProducts(),
    getPublicSettings(),
  ]);
  const featured = pickFeatured(products, categories.map((c) => c.slug));
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  const categoryNames = new Map(categories.map((c) => [c.slug as string, c.name]));

  return (
    <Container as="div" className={styles.page}>
      <JsonLd data={graph(organizationNode(), websiteNode())} />

      <section className={styles.hero} aria-labelledby="home-titulo">
        {/* El banner trae el logo y el lema dentro de la imagen. El H1 queda solo para lectores de pantalla y buscadores. */}
        <h1 id="home-titulo" className={styles.srOnly}>
          Nutra Elements: suplementos en cápsulas de marca propia
        </h1>
        <Image
          src="/banner.jpeg"
          alt="Nutra Elements: productos naturales premium. Hojas verdes, mortero y frascos de vidrio ámbar."
          width={1565}
          height={629}
          priority
          fetchPriority="high"
          quality={75}
          sizes="100vw"
          className={styles.heroImage}
        />
        <div className={styles.heroActions}>
          <Button href="/productos">
            Ver catálogo
          </Button>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="home-categorias">
        <SectionHeading id="home-categorias" title="Compra por categoría" />
        <ul className="category-grid">
          {categories.map((c) => (
            <li key={c.slug}>
              <CategoryCard category={c} productCount={counts.get(c.slug) ?? 0} />
            </li>
          ))}
        </ul>
      </section>

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
              <ProductCard product={p} categoryName={categoryNames.get(p.categoryId)} />
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block} aria-labelledby="home-despacho">
        <SectionHeading id="home-despacho" title="Despacho en la RM y retiro en tienda en Puente Alto" />
        <div className={styles.text}>
          <p>
            Despachamos a toda la Región Metropolitana por {formatClp(settings.shippingFee)}. También puedes retirar tu
            pedido en {settings.pickup.address}: {settings.pickup.hours.toLowerCase()}. Más detalles en{" "}
            <Link href="/preguntas-frecuentes">preguntas frecuentes</Link>.
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
            <h3>Paga con Flow o transferencia</h3>
            <p>Elige el medio de pago que prefieras al finalizar tu compra.</p>
          </li>
        </ul>
        <p className={styles.text}>
          Conoce <Link href="/nosotros">quiénes somos</Link> o escríbenos desde <Link href="/contacto">contacto</Link>.
        </p>
      </section>
    </Container>
  );
}
