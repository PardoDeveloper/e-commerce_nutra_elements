// Tipos de la persistencia local del prototipo (D-030). Solo tipos: se pueden importar desde el cliente.
import type { CategoryId, ProductDiscount } from "@/lib/data/types";

/** Imagen guardada. `path` imita la ruta de Storage: `products/<sku>/<id>.<ext>`. */
export interface StoredImage {
  path: string;
  alt: string;
}

/**
 * Estado de un producto guardado por el admin (campos del contrato de productos).
 * Se guarda el registro completo por SKU; lo que no está aquí viene del catálogo base.
 */
export interface StoredProduct {
  name: string;
  slug: string | null;
  description: string | null;
  shortDescription: string | null;
  categoryId: CategoryId | null;
  images: StoredImage[];
  price: number;
  discount: ProductDiscount | null;
  /** Unidades disponibles (el admin ya descontó lo reservado). */
  stock: number;
  active: boolean;
  published: boolean;
  format: string | null;
  unitsPerPack: number | null;
  /** Destacado en el inicio. Opcional: lo guardado antes no lo trae (= false). */
  featured?: boolean;
  seo: { title?: string; description?: string } | null;
  /** Comisión en CLP por unidad. Opcional: lo guardado antes no la trae. */
  commissionPerUnit?: number | null;
  deletedAt: string | null;
  deletedBy: string | null;
}

export type StoredProductInput = StoredProduct & { sku: string };

export interface StoreFile {
  version: 1;
  products: Record<string, StoredProduct>;
}
