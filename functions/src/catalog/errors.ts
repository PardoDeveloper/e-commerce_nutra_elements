import { HttpsError, type FunctionsErrorCode } from "firebase-functions/v2/https";

// Errores propios del catálogo (functions.md 5). Los comunes (INVALID_INPUT, INTERNAL, NOT_ADMIN...)
// salen de `common/errors.ts`; estos se mantienen aquí para no tocar ese archivo (lo comparten otras
// carpetas). Los mensajes son fijos y nunca interpolan datos del request.
const CATALOG_ERRORS = {
  TOO_MANY_ROWS: ["invalid-argument", "El lote tiene demasiadas filas. Divídelo e intenta de nuevo."],
  EMPTY_BATCH: ["invalid-argument", "El lote no tiene filas."],
  SKU_NOT_FOUND: ["not-found", "El producto no existe."],
  SKU_EXISTS: ["failed-precondition", "Ya existe un producto con ese SKU."],
  PRODUCT_DELETED: ["failed-precondition", "El producto está eliminado. Restáuralo antes de modificarlo."],
  INVALID_PRICE: ["invalid-argument", "El precio debe ser un entero entre 1 y 10.000.000 (CLP)."],
  INVALID_STOCK: ["invalid-argument", "El stock debe ser un entero entre 0 y 1.000.000."],
  EMPTY_STOCK: ["invalid-argument", "El stock está vacío: no se cambió el producto."],
} as const satisfies Record<string, readonly [FunctionsErrorCode, string]>;

export type CatalogErrorCode = keyof typeof CATALOG_ERRORS;

/** `HttpsError` del contrato para un error global del catálogo (`details.code` = código). */
export function catalogError(code: CatalogErrorCode, extra: { sku?: string } = {}): HttpsError {
  const [httpsCode, message] = CATALOG_ERRORS[code];
  const details: { code: CatalogErrorCode; sku?: string } = { code };
  if (extra.sku !== undefined) details.sku = extra.sku;
  return new HttpsError(httpsCode, message, details);
}
