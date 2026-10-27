import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { ProductCard } from "@/components/ProductCard";
import { CatalogBrowser } from "@/components/store/CatalogBrowser";
import { JsonLd } from "@/components/store/JsonLd";
import styles from "@/components/store/store.module.css";
import { getCategories, getProducts } from "@/lib/data";
import { breadcrumbList, collectionPageNode, graph, pageMetadata } from "@/lib/seo";

// Estática con ISR (D-022). No lee searchParams: el filtro y ?q= se resuelven en el cliente.
export const revalidate = 3600;

export async function generateMetadata() {
  const products = await getProducts();
  return pageMetadata({
    title: "Catálogo de suplementos en cápsulas | Nutra Elements",
    description: `Los ${products.length} productos Nutra Elements: vitaminas, magnesio, minerales, omega 3, colágeno y más. Despacho RM $3.990 y retiro en tienda en Puente Alto.`,
    path: "/productos",
  });
}

export default async function CatalogPage() {
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);
  const groups = categories
    .map((c) => ({ category: c, items: products.filter((p) => p.categoryId === c.slug) }))
    .filter((g) => g.items.length > 0);
  // La categoría es opcional (D-040): los productos sin categoría (o con una no publicada) van al final.
  const known = new Set(categories.map((c) => c.slug));
  const others = products.filter((p) => p.categoryId === null || !known.has(p.categoryId));
  // El ItemList sigue el orden visible (agrupado por categoría).
  const ordered = [...groups.flatMap((g) => g.items), ...others];

  return (
    <Container as="div" className={styles.page}>
      <JsonLd
        data={graph(
          breadcrumbList([{ name: "Inicio", path: "/" }, { name: "Catálogo" }]),
          collectionPageNode(
            "Catálogo de suplementos Nutra Elements",
            "/productos",
            ordered.map((p) => p.slug),
          ),
        )}
      />
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: "Catálogo" }]} />
      <header className={styles.pageHead}>
        <h1>Catálogo de suplementos Nutra Elements</h1>
        <p className={styles.lead}>
          Suplementos alimentarios en cápsulas, de marca propia. Despachamos en toda la RM y puedes retirar en nuestra
          tienda en Puente Alto.
        </p>
      </header>

      <CatalogBrowser products={products} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}>
        {groups.map(({ category, items }) => (
          <section key={category.slug} className={styles.block} aria-labelledby={`cat-${category.slug}`}>
            <div className={styles.groupHead}>
              <h2 id={`cat-${category.slug}`}>{category.name}</h2>
              <Link href={`/categorias/${category.slug}`} className={styles.inlineLink}>
                Ver {category.name.toLowerCase()}
              </Link>
            </div>
            <ul className="product-grid">
              {items.map((p) => (
                <li key={p.sku}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {others.length > 0 ? (
          <section className={styles.block} aria-labelledby="cat-otros">
            <div className={styles.groupHead}>
              <h2 id="cat-otros">{groups.length > 0 ? "Otros productos" : "Productos"}</h2>
            </div>
            <ul className="product-grid">
              {others.map((p) => (
                <li key={p.sku}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CatalogBrowser>
    </Container>
  );
}
