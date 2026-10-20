import Link from "next/link";
import type { Product } from "@/lib/data/types";
import { AddToCartButton } from "./AddToCartButton";
import { Price } from "./Price";
import { ProductImage } from "./ProductImage";
import { StockBadge } from "./StockBadge";
import styles from "./ProductCard.module.css";

/** Primera imagen real del producto (con su texto alternativo), si existe. */
export function mainImage(product: Product): { url: string; alt: string } | null {
  const first = product.images[0];
  return first?.url ? { url: first.url, alt: first.alt } : null;
}

interface ProductCardProps {
  product: Product;
  /** Nombre de la categoría, si se quiere mostrar sobre el título. */
  categoryName?: string;
  /** Ocultar el botón de agregar (por ejemplo en listados compactos). */
  hideAddToCart?: boolean;
}

/**
 * Tarjeta de producto. Úsala dentro de `<ul className="product-grid"><li>…</li></ul>`.
 * Todo el bloque es clicable (enlace "estirado" sobre el título); el botón de
 * agregar queda por encima y es independiente.
 */
export function ProductCard({ product, categoryName, hideAddToCart = false }: ProductCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <ProductImage name={product.name} categoryId={product.categoryId} alt="" image={mainImage(product)} />
      </div>
      <div className={styles.body}>
        {categoryName ? <p className={styles.category}>{categoryName}</p> : null}
        <h3 className={styles.title}>
          <Link href={`/productos/${product.slug}`} className={styles.link}>
            {product.name}
          </Link>
        </h3>
        <Price price={product.price} finalPrice={product.finalPrice} />
        <StockBadge inStock={product.inStock} />
      </div>
      {hideAddToCart ? null : (
        <div className={styles.actions}>
          <AddToCartButton product={product} fullWidth variant="outline" label="Agregar" />
        </div>
      )}
    </article>
  );
}
