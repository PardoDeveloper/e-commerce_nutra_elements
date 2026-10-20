import Link from "next/link";
import type { Category } from "@/lib/data/types";
import styles from "./CategoryCard.module.css";

interface CategoryCardProps {
  category: Pick<Category, "slug" | "name">;
  /** Cantidad de productos, si se conoce. */
  productCount?: number;
}

/** Tarjeta de categoría: enlace grande (área táctil completa) a /categorias/[slug]. */
export function CategoryCard({ category, productCount }: CategoryCardProps) {
  return (
    <Link href={`/categorias/${category.slug}`} className={`${styles.card} ${styles[category.slug.replace("-", "")] ?? ""}`}>
      <svg className={styles.icon} viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false">
        <path d="M6 34C6 17 16 7 34 6c0 17-10 27-28 28z" fill="currentColor" /><path d="M8 33l16-16" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className={styles.name}>{category.name}</span>
      {productCount !== undefined ? (
        <span className={styles.count}>
          {productCount} {productCount === 1 ? "producto" : "productos"}
        </span>
      ) : null}
    </Link>
  );
}
