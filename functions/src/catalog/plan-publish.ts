import { loadProduct } from "./product.js";
import { MSG, type ChunkPlan, type Item } from "./prepare.js";
import { Collector } from "./report.js";
import type { CatalogReader } from "./store.js";
import { updateOp, type ProductData, type ProductOp } from "./types.js";

// setProductsPublished (functions.md 5.5). Despublicar siempre se permite en productos vigentes;
// publicar exige todas las condiciones. Una fila inválida informa el primer problema como `code` y
// lista todos en el mensaje, para que el admin los corrija de una vez.

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CATEGORY_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG = 80;
const MAX_ALT = 140;

export interface PublishProblem {
  code: string;
  label: string;
}

export interface PublishContext {
  /** Categorías leídas, por id. */
  categories: ReadonlyMap<string, Record<string, unknown>>;
  /** ¿Otro producto vigente usa ya este slug? (en la base o reclamado por este mismo lote) */
  slugTakenByOther: (slug: string, sku: string) => boolean;
}

/** Problemas que impiden publicar un producto, en el orden del contrato. Lista vacía = se puede publicar. */
export function publishProblems(product: ProductData, ctx: PublishContext): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (!product.active) problems.push({ code: "NOT_ACTIVE", label: "el producto no está activo" });
  if (product.name.trim().length === 0) problems.push({ code: "MISSING_NAME", label: "falta el nombre" });

  const slug = product.slug;
  if (slug === null || slug.trim().length === 0) {
    problems.push({ code: "MISSING_SLUG", label: "falta el slug" });
  } else if (slug.length > MAX_SLUG || !SLUG_PATTERN.test(slug)) {
    problems.push({ code: "INVALID_SLUG", label: "el slug no es válido (minúsculas, números y guiones)" });
  } else if (ctx.slugTakenByOther(slug, product.sku)) {
    problems.push({ code: "DUPLICATE_SLUG", label: "otro producto usa el mismo slug" });
  }

  if (product.description === null || product.description.trim().length === 0) {
    problems.push({ code: "MISSING_DESCRIPTION", label: "falta la descripción" });
  }

  const category = product.categoryId !== null ? ctx.categories.get(product.categoryId) : undefined;
  if (!category || category["published"] !== true) {
    problems.push({ code: "INVALID_CATEGORY", label: "falta una categoría publicada" });
  }

  const prefix = `products/${product.sku}/`;
  const hasImage = product.images.some(
    (img) => img.path.startsWith(prefix) && img.path.length > prefix.length && !img.path.includes("..") && img.alt.trim().length > 0 && img.alt.length <= MAX_ALT,
  );
  if (!hasImage) problems.push({ code: "MISSING_IMAGE", label: "falta al menos una imagen con texto alternativo" });

  if (product.price < 1) problems.push({ code: "INVALID_PRICE", label: "el precio no es válido" });
  return problems;
}

/**
 * Planifica un trozo del lote. `claimed` guarda los slugs que ya reservó este mismo llamado en
 * trozos anteriores (slug -> sku); se actualiza solo cuando la transacción se confirma (`commit`),
 * así un reintento de la transacción no deja reclamos fantasma.
 */
export async function planSetPublished(
  reader: CatalogReader,
  items: readonly Item<null>[],
  published: boolean,
  claimed: Map<string, string>,
): Promise<ChunkPlan> {
  const raw = await reader.getProducts(items.map((i) => i.sku));
  const c = new Collector();
  const ops: ProductOp[] = [];

  // Lecturas adicionales (todas antes de decidir): categorías y dueños de cada slug.
  const loaded = new Map(items.map((i) => [i.sku, loadProduct(raw, i.sku)] as const));
  const candidates: ProductData[] = [];
  if (published) {
    for (const { sku } of items) {
      const l = loaded.get(sku);
      if (l?.status === "ok" && !l.product.deleted && !l.product.published) candidates.push(l.product);
    }
  }
  const categoryIds = [...new Set(candidates.map((p) => p.categoryId).filter((id): id is string => id !== null && CATEGORY_ID_PATTERN.test(id)))];
  const categories = categoryIds.length > 0 ? await reader.getCategories(categoryIds) : new Map<string, Record<string, unknown>>();
  const slugs = [...new Set(candidates.map((p) => p.slug).filter((s): s is string => s !== null && s.length <= MAX_SLUG && SLUG_PATTERN.test(s)))];
  const owners = new Map<string, { sku: string; deleted: boolean }[]>();
  await Promise.all(
    slugs.map(async (slug) => {
      owners.set(slug, await reader.findProductsBySlug(slug));
    }),
  );

  const accepted = new Map<string, string>(); // slugs aceptados en este trozo
  const ctx: PublishContext = {
    categories,
    slugTakenByOther: (slug, sku) => {
      const inBatch = accepted.get(slug) ?? claimed.get(slug);
      if (inBatch !== undefined && inBatch !== sku) return true;
      return (owners.get(slug) ?? []).some((o) => o.sku !== sku && !o.deleted);
    },
  };

  for (const { row, sku } of items) {
    const l = loaded.get(sku);
    if (!l || l.status === "missing") {
      c.reject(row, "SKU_NOT_FOUND", MSG.notFound, sku);
      continue;
    }
    if (l.status === "corrupt") {
      c.reject(row, "INVALID_PRODUCT_DATA", MSG.corrupt, sku);
      continue;
    }
    const product = l.product;
    if (product.deleted) {
      c.reject(row, "PRODUCT_DELETED", MSG.deleted, sku);
      continue;
    }
    if (product.published === published) {
      c.unchanged++;
      continue;
    }
    if (!published) {
      ops.push(updateOp(product, { published: false }));
      c.updated++;
      continue;
    }
    const problems = publishProblems(product, ctx);
    const first = problems[0];
    if (first) {
      c.reject(row, first.code, `No se puede publicar: ${problems.map((p) => p.label).join("; ")}.`, sku);
      continue;
    }
    if (product.slug !== null) accepted.set(product.slug, sku);
    ops.push(updateOp(product, { published: true }, { setPublishedAt: !product.hasPublishedAt }));
    c.updated++;
  }

  return {
    ops,
    collector: c,
    commit: () => {
      for (const [slug, sku] of accepted) claimed.set(slug, sku);
    },
  };
}
