import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  createProduct,
  deleteProducts,
  importCatalog,
  importPrices,
  importStock,
  restoreProducts,
  setProductsPublished,
  updateProductCommerce,
} from "./callables.js";

// Autorización de los callables. No llega a Firestore: assertAdmin falla antes de crear el almacén.
// (Con sesión de admin y datos válidos el handler pide el almacén real: eso solo se prueba con emulador.)

const all = { importCatalog, importPrices, importStock, applyDiscount, setProductsPublished, createProduct, updateProductCommerce, deleteProducts, restoreProducts };

type RunFn = (request: unknown) => Promise<unknown>;
const run = (fn: unknown): RunFn => (fn as { run: RunFn }).run;

describe.each(Object.entries(all))("%s", (_name, fn) => {
  it("sin sesión: UNAUTHENTICATED", async () => {
    await expect(run(fn)({ data: {}, auth: undefined })).rejects.toMatchObject({ code: "unauthenticated", details: { code: "UNAUTHENTICATED" } });
  });

  it("con sesión sin claim admin: NOT_ADMIN", async () => {
    await expect(run(fn)({ data: {}, auth: { uid: "u1", token: {} } })).rejects.toMatchObject({ code: "permission-denied", details: { code: "NOT_ADMIN" } });
  });

  it("claim admin que no es true estricto ('true', 1): NOT_ADMIN", async () => {
    for (const admin of ["true", 1]) {
      await expect(run(fn)({ data: {}, auth: { uid: "u1", token: { admin } } })).rejects.toMatchObject({ details: { code: "NOT_ADMIN" } });
    }
  });
});

it("la entrada inválida de un admin se rechaza con INVALID_INPUT antes de tocar datos", async () => {
  // La validación ocurre antes de pedir el almacén real, así que esto no necesita Firestore.
  await expect(run(importPrices)({ data: { rows: "x" }, auth: { uid: "a", token: { admin: true } } })).rejects.toMatchObject({ details: { code: "INVALID_INPUT" } });
  await expect(run(deleteProducts)({ data: { skus: [] }, auth: { uid: "a", token: { admin: true } } })).rejects.toMatchObject({ details: { code: "EMPTY_BATCH" } });
});
