"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/data/types";
import styles from "./store.module.css";

interface CatalogBrowserProps {
  products: Product[];
  categories: Array<{ slug: string; name: string }>;
  /** Vista base (agrupada por categoría), renderizada en el servidor y presente en el HTML estático. */
  children: ReactNode;
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function Results({ products, categories, children }: CatalogBrowserProps) {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const category = params.get("categoria") ?? "";
  const active = q !== "" || category !== "";

  const filters = (
    <nav aria-label="Filtrar por categoría" className={styles.filters}>
      <ul className={styles.linkList}>
        <li>
          <Link href="/productos" aria-current={!category ? "true" : undefined} scroll={false}>
            Todas
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/productos?categoria=${c.slug}`}
              aria-current={category === c.slug ? "true" : undefined}
              scroll={false}
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  if (!active) {
    return (
      <>
        {filters}
        {children}
      </>
    );
  }

  const terms = normalize(q).split(/\s+/).filter(Boolean);
  const names = new Map(categories.map((c) => [c.slug, c.name]));
  const list = products.filter(
    (p) =>
      (!category || p.categoryId === category) &&
      terms.every((t) => normalize(p.name).includes(t)),
  );

  return (
    <>
      {/* Los resultados filtrados no se indexan (contrato 02): la canonical sigue en /productos. */}
      <meta name="robots" content="noindex,follow" />
      {filters}
      <p className={styles.searchNote} role="status">
        {list.length} {list.length === 1 ? "resultado" : "resultados"}
        {q ? ` para "${q}"` : ""}
        {category && names.get(category) ? ` en ${names.get(category)}` : ""}.
      </p>
      {list.length === 0 ? (
        <div className={styles.empty}>
          <p>No encontramos productos con ese criterio.</p>
          <p>
            <Link href="/productos" className={styles.inlineLink}>
              Ver todo el catálogo
            </Link>
          </p>
        </div>
      ) : (
        <ul className="product-grid">
          {list.map((p) => (
            <li key={p.sku}>
              <ProductCard product={p} categoryName={names.get(p.categoryId)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Filtro y búsqueda del catálogo en el cliente. La página sigue siendo estática (ISR):
 * el HTML trae el catálogo completo agrupado y, si la URL trae ?q= o ?categoria=, se
 * reemplaza por los resultados filtrados.
 */
export function CatalogBrowser(props: CatalogBrowserProps) {
  return (
    <Suspense fallback={props.children}>
      <Results {...props} />
    </Suspense>
  );
}
