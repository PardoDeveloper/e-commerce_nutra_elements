import { onCall, type CallableOptions, type CallableRequest } from "firebase-functions/v2/https";
import { assertAdmin, callableSecurityOptions } from "../common/auth.js";
import { toHttpsError } from "../common/errors.js";
import { createFirestoreStore } from "./firestore-store.js";
import {
  handleApplyDiscount,
  handleCreateProduct,
  handleDeleteProducts,
  handleImportCatalog,
  handleImportPrices,
  handleImportStock,
  handleRestoreProducts,
  handleSetProductsPublished,
  handleUpdateProductCommerce,
} from "./handlers.js";
import type { CatalogStore } from "./store.js";

// Callables v2 del catálogo (functions.md 5). Todas: admin (claim `admin === true`), App Check
// exigido fuera del emulador, región us-east4 (setGlobalOptions) y errores del contrato.

let cachedStore: CatalogStore | undefined;
/** El almacén se crea en la primera invocación (no al cargar el módulo). */
const getStore = (): CatalogStore => (cachedStore ??= createFirestoreStore());

/** Almacén perezoso: la validación de entrada ocurre antes de que se cree el cliente de Firestore. */
const lazyStore: CatalogStore = {
  runTransaction: (fn, options) => getStore().runTransaction(fn, options),
  saveImport: (record) => getStore().saveImport(record),
};

type Handler<R> = (store: CatalogStore, data: unknown, uid: string) => Promise<R>;

function adminCallable<R>(options: CallableOptions, handler: Handler<R>) {
  return onCall({ ...callableSecurityOptions(), ...options }, async (request: CallableRequest<unknown>): Promise<R> => {
    try {
      const uid = assertAdmin(request);
      return await handler(lazyStore, request.data, uid);
    } catch (err) {
      throw toHttpsError(err);
    }
  });
}

const BATCH: CallableOptions = { memory: "256MiB", timeoutSeconds: 60, maxInstances: 2 };
const SINGLE: CallableOptions = { memory: "256MiB", timeoutSeconds: 30, maxInstances: 2 };

export const importCatalog = adminCallable({ memory: "512MiB", timeoutSeconds: 120, maxInstances: 2 }, handleImportCatalog);
export const importPrices = adminCallable(BATCH, handleImportPrices);
export const importStock = adminCallable(BATCH, handleImportStock);
export const applyDiscount = adminCallable(BATCH, handleApplyDiscount);
export const setProductsPublished = adminCallable(BATCH, handleSetProductsPublished);
export const createProduct = adminCallable(SINGLE, handleCreateProduct);
export const updateProductCommerce = adminCallable(SINGLE, handleUpdateProductCommerce);
export const deleteProducts = adminCallable(BATCH, handleDeleteProducts);
export const restoreProducts = adminCallable(BATCH, handleRestoreProducts);
