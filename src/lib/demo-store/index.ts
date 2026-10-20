import "server-only";
// Punto de entrada servidor de la persistencia local del prototipo (D-030).
export { isPersistenceEnabled } from "./config";
export { applyStoredToAdmin, mergeStoredIntoProduct } from "./merge";
export { DemoStoreError, readImage, readStoreSync, resetStore, saveImage, saveProducts } from "./store";
export type { BaseRef, SaveResult } from "./store";
export type { StoredProduct } from "./types";
