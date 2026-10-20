// Punto de entrada ÚNICO de la capa de datos. Las páginas importan solo de aquí:
//   import { getProducts, getCategory } from "@/lib/data";
// La fuente la decide resolveDataSource() (DATA_SOURCE, y siempre "firebase" en la nube): "demo" (por defecto en
// local, mock + persistencia local, D-030) o "firebase" (Firestore, D-031).
// Solo servidor: no importar desde Client Components (usa tipos con `import type`).
import { resolveDataSource } from "../data-source";
import { firestoreDataLayer } from "./firestore";
import { getBaseCatalog, mockDataLayer } from "./mock";
import type { DataLayer } from "./types";

export type * from "./types";

const layer: DataLayer = resolveDataSource() === "firebase" ? firestoreDataLayer : mockDataLayer;

export const getCategories = layer.getCategories;
export const getCategory = layer.getCategory;
export const getProducts = layer.getProducts;
export const getProduct = layer.getProduct;
export const getRelatedProducts = layer.getRelatedProducts;
export const getPublicSettings = layer.getPublicSettings;

/** Solo demo (D-030): catálogo base sin cambios guardados. Desaparece con la integración real. */
export { getBaseCatalog };
