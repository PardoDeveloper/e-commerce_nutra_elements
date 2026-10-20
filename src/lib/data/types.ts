// Tipos públicos de la capa de datos. Alineados con docs/team/contracts/data-model.md
// (productos 2.1, categorías 2.2, ajustes públicos 2.5), pero SOLO con lo que la
// tienda pública necesita: no incluyen `stock` ni `reserved` (solo `inStock`),
// ni campos internos como `sourceName`, `barcode` o `source`.

export type Sku = string;
export type Clp = number;
export type CategoryId = "vitaminas" | "magnesio" | "minerales" | "omega-3" | "belleza" | "bienestar";

export interface ProductDiscount {
  type: "percent" | "fixed";
  value: number;
}

export interface ProductImage {
  /** Ruta en Storage (`products/{sku}/{id}.webp`). */
  path: string;
  alt: string;
  /**
   * URL desde la que se muestra. En la demo es `/api/demo-images/...` (D-030); con Firebase será la
   * URL de descarga de Storage. Si falta, la tienda muestra el marcador.
   */
  url?: string;
}

export interface Product {
  sku: Sku;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  categoryId: CategoryId;
  images: ProductImage[];
  /** Precio de lista en CLP. */
  price: Clp;
  discount: ProductDiscount | null;
  /** Precio efectivo (lista menos descuento), ya derivado. Solo para mostrar (D-005). */
  finalPrice: Clp;
  inStock: boolean;
  format: string | null;
  unitsPerPack: number | null;
  /** Slug que agrupa los tamaños de un mismo producto. */
  family: string | null;
  seo: { title?: string; description?: string } | null;
}

export interface Category {
  slug: CategoryId;
  name: string;
  description: string | null;
  order: number;
  seo: { title?: string; description?: string } | null;
}

export interface PublicSettings {
  shippingFee: Clp;
  /** null = no hay envío gratis. */
  freeShippingThreshold: Clp | null;
  communes: Array<{ code: string; name: string }>;
  pickup: { enabled: boolean; address: string; hours: string };
  maxQtyPerItem: number;
}

export interface GetProductsOptions {
  /** Slug de la categoría. */
  category?: string;
  /** Texto de búsqueda (sin distinguir tildes ni mayúsculas). */
  q?: string;
  limit?: number;
}

/**
 * Contrato de la capa de datos. Las páginas y componentes solo dependen de esto
 * (importando desde "@/lib/data"), nunca de la implementación.
 */
export interface DataLayer {
  getCategories(): Promise<Category[]>;
  getCategory(slug: string): Promise<Category | null>;
  getProducts(options?: GetProductsOptions): Promise<Product[]>;
  getProduct(slug: string): Promise<Product | null>;
  getRelatedProducts(sku: Sku, limit?: number): Promise<Product[]>;
  getPublicSettings(): Promise<PublicSettings>;
}
