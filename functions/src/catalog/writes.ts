import type { CreateOp, UpdateOp } from "./types.js";

// Traduce una operación del planificador a los datos del documento. `now` es la marca de tiempo:
// `FieldValue.serverTimestamp()` en Firestore, un `Date` en los tests.

export function buildCreateData<T>(op: CreateOp, now: T): Record<string, unknown> {
  const f = op.fields;
  return {
    sku: f.sku,
    sourceName: f.sourceName,
    name: f.name,
    slug: null,
    description: null,
    shortDescription: null,
    categoryId: null,
    images: [],
    price: f.price,
    discount: null,
    finalPrice: f.price,
    stock: f.stock,
    reserved: 0,
    inStock: f.stock > 0,
    active: f.active,
    published: false,
    publishedAt: null,
    barcode: f.barcode,
    barcodeValid: f.barcodeValid,
    gtin: f.gtin,
    // Comisión del químico: se define después desde el admin (updateProductCommerce).
    commissionPerUnit: null,
    format: f.format,
    unitsPerPack: f.unitsPerPack,
    seo: null,
    source: f.source,
    importedAt: op.imported ? now : null,
    // D-029: todo producto lleva `deletedAt: null` explícito (las consultas y reglas públicas lo necesitan).
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildUpdateData<T>(op: UpdateOp, now: T, uid: string): Record<string, unknown> {
  const data: Record<string, unknown> = { ...op.patch, updatedAt: now };
  if (op.imported) data["importedAt"] = now;
  if (op.setPublishedAt) data["publishedAt"] = now;
  if (op.deletion === "delete") {
    data["deletedAt"] = now;
    data["deletedBy"] = uid;
    data["published"] = false; // invariante: eliminado => despublicado
  } else if (op.deletion === "restore") {
    data["deletedAt"] = null;
    data["deletedBy"] = null;
    data["published"] = false; // vuelve despublicado; publicar es un paso aparte
  } else if (op.healDeletedFields) {
    data["deletedAt"] = null;
    data["deletedBy"] = null;
  }
  return data;
}
