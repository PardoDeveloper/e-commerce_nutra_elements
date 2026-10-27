import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { ProductCard } from "@/components/ProductCard";
import { JsonLd } from "@/components/store/JsonLd";
import styles from "@/components/store/store.module.css";
import { getCategories, getCategory, getProducts, getPublicSettings } from "@/lib/data";
import { formatClp } from "@/lib/format";
import { breadcrumbList, categorySeo, collectionPageNode, graph, pageMetadata } from "@/lib/seo";

export const revalidate = 3600;
export const dynamicParams = true;

// Contrato 03: menos de 3 productos publicados = noindex,follow y fuera del sitemap.
const MIN_PRODUCTS_TO_INDEX = 3;

export async function generateStaticParams() {
  const categories = await getCategories();
  const withProducts = await Promise.all(
    categories.map(async (c) => ((await getProducts({ category: c.slug })).length > 0 ? c.slug : null)),
  );
  return withProducts.filter((s): s is NonNullable<typeof s> => s !== null).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return { title: "Categoría no encontrada", robots: { index: false, follow: false } };
  const products = await getProducts({ category: slug });
  const seo = categorySeo(category);
  return pageMetadata({
    title: seo.title,
    description: seo.description,
    path: `/categorias/${slug}`,
    index: products.length >= MIN_PRODUCTS_TO_INDEX,
  });
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [category, categories, settings] = await Promise.all([getCategory(slug), getCategories(), getPublicSettings()]);
  if (!category) notFound();
  const products = await getProducts({ category: slug });
  if (products.length === 0) notFound();

  const seo = categorySeo(category);
  const packs = [...new Set(products.map((p) => p.unitsPerPack).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  const siblings = categories.filter((c) => c.slug !== category.slug).slice(0, 3);

  return (
    <Container as="div" className={styles.page}>
      <JsonLd
        data={graph(
          breadcrumbList([
            { name: "Inicio", path: "/" },
            { name: "Catálogo", path: "/productos" },
            { name: category.name },
          ]),
          collectionPageNode(category.name, `/categorias/${slug}`, products.map((p) => p.slug)),
        )}
      />
      <Breadcrumbs
        items={[{ label: "Inicio", href: "/" }, { label: "Catálogo", href: "/productos" }, { label: category.name }]}
      />
      <header className={styles.pageHead}>
        <h1>{category.name}</h1>
        <p className={styles.lead}>{seo.intro}</p>
      </header>

      <section className={styles.block} aria-labelledby="cat-productos">
        <h2 id="cat-productos">Productos de {category.name.toLowerCase()}</h2>
        <ul className="product-grid">
          {products.map((p) => (
            <li key={p.sku}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      </section>

      {products.length > 1 && packs.length > 0 ? (
        <section className={styles.block} aria-labelledby="cat-formatos">
          <h2 id="cat-formatos">Formatos disponibles</h2>
          <div className={styles.text}>
            <p>
              Esta categoría tiene {products.length} productos, en presentaciones de {packs.join(", ")} unidades según
              el caso. Cada uno tiene su propia ficha, con el detalle del rótulo.
            </p>
          </div>
        </section>
      ) : null}

      <section className={styles.block} aria-labelledby="cat-despacho">
        <h2 id="cat-despacho">Despacho y retiro</h2>
        <div className={styles.text}>
          <p>
            Despachamos a toda la RM por {formatClp(settings.shippingFee)} y puedes retirar en tienda en Puente Alto.
            Revisa los detalles en <Link href="/#preguntas-frecuentes">preguntas frecuentes</Link>.
          </p>
        </div>
      </section>

      <nav className={styles.block} aria-labelledby="cat-ver-tambien">
        <h2 id="cat-ver-tambien">Ver también</h2>
        <ul className={styles.linkList}>
          {siblings.map((c) => (
            <li key={c.slug}>
              <Link href={`/categorias/${c.slug}`}>{c.name}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </Container>
  );
}
