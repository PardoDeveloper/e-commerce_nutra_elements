import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Container } from "@/components/Container";
import { Price } from "@/components/Price";
import { mainImage, ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { StockBadge } from "@/components/StockBadge";
import { JsonLd } from "@/components/store/JsonLd";
import { ProductPurchase } from "@/components/store/ProductPurchase";
import styles from "@/components/store/store.module.css";
import { getCategory, getProduct, getProducts, getPublicSettings, getRelatedProducts } from "@/lib/data";
import { formatClp } from "@/lib/format";
import {
  absoluteUrl,
  breadcrumbList,
  displayName,
  graph,
  metaDescriptionFrom,
  pageMetadata,
  productDescription,
  productMetaDescription,
  productNode,
  withBrand,
} from "@/lib/seo";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Producto no encontrado", robots: { index: false, follow: false } };
  const name = displayName(product.name);
  // Título y descripción SEO salen del nombre y la descripción del producto (D-040).
  return pageMetadata({
    title: withBrand(name),
    description: product.description ? metaDescriptionFrom(product.description) : productMetaDescription(product.name, product.unitsPerPack),
    path: `/productos/${slug}`,
  });
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const [category, relatedProducts, settings] = await Promise.all([
    product.categoryId ? getCategory(product.categoryId) : Promise.resolve(null),
    getRelatedProducts(product.sku, 4),
    getPublicSettings(),
  ]);
  const name = displayName(product.name);
  // La categoría es opcional (D-040): sin categoría publicada, la ficha no la muestra ni la enlaza.
  const categoryCrumb = category ? [{ name: category.name, path: `/categorias/${category.slug}` }] : [];
  const description = productDescription(product);
  // JSON-LD: solo URL absolutas de imágenes reales (las de la demo son rutas propias; se completan con SITE_URL).
  const images = product.images.flatMap((i) => (i.url ? [/^https?:\/\//.test(i.url) ? i.url : absoluteUrl(i.url)] : []));
  const photo = mainImage(product);

  return (
    <Container as="div" className={styles.page}>
      <JsonLd
        data={graph(
          productNode({
            name,
            slug: product.slug,
            sku: product.sku,
            description,
            category: category?.name,
            price: product.finalPrice,
            inStock: product.inStock,
            shippingFee: settings.shippingFee,
            images,
            gtin13: product.gtin ?? null,
          }),
          breadcrumbList([
            { name: "Inicio", path: "/" },
            { name: "Catálogo", path: "/productos" },
            ...categoryCrumb,
            { name },
          ]),
        )}
      />
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: "Catálogo", href: "/productos" },
          ...categoryCrumb.map((c) => ({ label: c.name, href: c.path })),
          { label: name },
        ]}
      />

      <div className={styles.productLayout}>
        <div className={styles.productMedia}>
          <ProductImage name={product.name} categoryId={product.categoryId} alt={`${name}, frasco Nutra Elements`} image={photo} />
        </div>
        <div className={styles.buyBox}>
          <h1>{name}</h1>
          {category ? (
            <p className={styles.meta}>
              Categoría:{" "}
              <Link href={`/categorias/${category.slug}`} className={styles.inlineLink}>
                {category.name}
              </Link>
            </p>
          ) : null}
          <Price price={product.price} finalPrice={product.finalPrice} size="lg" />
          <StockBadge inStock={product.inStock} />
          <ProductPurchase product={product} max={settings.maxQtyPerItem} />
          <p className={styles.meta}>
            Despacho en la RM {formatClp(settings.shippingFee)} o retiro en tienda en Puente Alto.
          </p>
        </div>
      </div>

      <section className={styles.block} aria-labelledby="prod-descripcion">
        <h2 id="prod-descripcion">Descripción</h2>
        <div className={styles.text}>
          <p>{description}</p>
          <p>Es un suplemento alimentario: no reemplaza una alimentación variada y equilibrada.</p>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="prod-info">
        <h2 id="prod-info">Información del producto</h2>
        <dl className={styles.facts}>
          <dt>Presentación</dt>
          <dd>{product.format ?? "Cápsulas"}</dd>
          {product.unitsPerPack ? (
            <>
              <dt>Contenido</dt>
              <dd>{product.unitsPerPack} cápsulas</dd>
            </>
          ) : null}
          <dt>Código (SKU)</dt>
          <dd>{product.sku}</dd>
        </dl>
        <div className={styles.text}>
          <p>Los ingredientes, la porción y los alérgenos están en el rótulo del frasco.</p>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="prod-uso">
        <h2 id="prod-uso">Modo de uso y advertencias</h2>
        <div className={styles.text}>
          <p>
            Sigue las indicaciones del rótulo. Mantén el producto fuera del alcance de los niños. Si estás embarazada,
            en lactancia o tomas medicamentos, consulta antes a un profesional de la salud.
          </p>
        </div>
      </section>

      <section className={styles.block} aria-labelledby="prod-despacho">
        <h2 id="prod-despacho">Despacho y retiro</h2>
        <div className={styles.text}>
          <p>
            Despachamos a toda la RM por {formatClp(settings.shippingFee)} y puedes retirar en {settings.pickup.address}.
            Más información en <Link href="/#preguntas-frecuentes">preguntas frecuentes</Link>.
          </p>
        </div>
      </section>

      {relatedProducts.length > 0 ? (
        <section className={styles.block} aria-labelledby="prod-relacionados">
          <h2 id="prod-relacionados">Productos relacionados</h2>
          <ul className="product-grid">
            {relatedProducts.map((p) => (
              <li key={p.sku}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Container>
  );
}
