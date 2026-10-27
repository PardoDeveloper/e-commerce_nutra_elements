// Tests de las reglas de Firestore (firestore.rules) contra el emulador.
// SIN EJECUTAR por D-026 (no hay emuladores todavía). Requieren: npm run test:rules con emuladores activos.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  NON_ADMIN_PROFILES,
  Timestamp,
  clientNow,
  contextFor,
  createEnv,
  FieldValue,
  serverNow,
  type Profile,
} from "./helpers.js";

let env: RulesTestEnvironment;

const db = (profile: Profile) => contextFor(env, profile).firestore();

// --- Datos de ejemplo ------------------------------------------------------

const ts = () => Timestamp.fromDate(new Date("2026-10-01T12:00:00Z"));

const product = (over: Record<string, unknown> = {}) => ({
  sku: "2427831",
  sourceName: "CITRATO DE MAGNESIO X 120 CAPS",
  name: "Citrato de Magnesio x 120 cápsulas",
  slug: "citrato-de-magnesio-120-capsulas",
  description: "Suplemento alimentario en cápsulas.",
  shortDescription: null,
  categoryId: "magnesio",
  images: [],
  price: 10990,
  discount: null,
  finalPrice: 10990,
  stock: 14,
  reserved: 2,
  inStock: true,
  active: true,
  published: true,
  publishedAt: ts(),
  deletedAt: null,
  deletedBy: null,
  barcode: null,
  barcodeValid: false,
  gtin: null,
  format: "capsulas",
  unitsPerPack: 120,
  family: "citrato-de-magnesio",
  seo: null,
  source: "controlfarma-xls",
  importedAt: ts(),
  createdAt: ts(),
  updatedAt: ts(),
  ...over,
});

const category = (over: Record<string, unknown> = {}) => ({
  slug: "magnesio",
  name: "Magnesio",
  description: null,
  imagePath: null,
  order: 20,
  published: true,
  seo: null,
  createdAt: ts(),
  updatedAt: ts(),
  ...over,
});

const order = {
  orderNumber: "NE-000001",
  number: 1,
  paymentMethod: "flow",
  paymentStatus: "pending_payment",
  fulfillmentStatus: null,
  stockState: "reserved",
  reservedUntil: ts(),
  customer: { firstName: "Ana", lastName: "Pérez", email: "ana@example.com", phone: "+56912345678", rut: "12345678-5" },
  delivery: { type: "pickup", storeAddress: "Av. Concha y Toro 180", storeHours: "L-V 9:00-20:00" },
  items: [{ sku: "2427831", name: "Citrato", unitPrice: 10990, discount: null, unitFinalPrice: 10990, qty: 1, lineTotal: 10990 }],
  subtotal: 10990,
  shipping: 0,
  total: 10990,
  currency: "CLP",
  freeShippingApplied: false,
  accessTokenHash: "abc",
  statusHistory: [],
  createdAt: ts(),
  updatedAt: ts(),
};

const publicSettings = (over: Record<string, unknown> = {}) => ({
  shippingFee: 3990,
  freeShippingThreshold: null,
  communes: [{ code: "puente-alto", name: "Puente Alto" }],
  pickup: { enabled: true, address: "Av. Concha y Toro 180, Puente Alto", hours: "Lunes a viernes de 9:00 a 20:00" },
  maxQtyPerItem: 10,
  updatedAt: serverNow(),
  ...over,
});

const privateSettings = (over: Record<string, unknown> = {}) => ({
  reservationMinutes: { flow: 30, transfer: 2880 },
  bank: {
    bankName: "BANCO DE PRUEBA",
    accountType: "Cuenta corriente",
    accountNumber: "000000000",
    holderName: "Nutra Elements (prueba)",
    holderRut: "11.111.111-1",
  },
  orderNumberStart: 1,
  limits: { createOrderPerIpPer10Min: 5, pendingOrdersPerEmail: 3, orderStatusPerIpPer10Min: 30, orderStatusFailuresPerOrder: 10 },
  updatedAt: serverNow(),
  ...over,
});

const contactMessage = {
  name: "Ana Pérez",
  email: "ana@example.com",
  phone: null,
  message: "Hola, ¿tienen stock de magnesio?",
  read: false,
  archived: false,
  createdAt: ts(),
  updatedAt: ts(),
};

// Copia del objeto sin una clave (para probar campos obligatorios ausentes).
const omit = (o: Record<string, unknown>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

// --- Preparación -----------------------------------------------------------

beforeAll(async () => {
  env = await createEnv("firestore");
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    await fs.doc("products/2427831").set(product()); // publicado y activo
    await fs.doc("products/P-DRAFT").set(product({ sku: "P-DRAFT", slug: null, published: false }));
    await fs.doc("products/P-INACTIVE").set(product({ sku: "P-INACTIVE", slug: "inactivo", active: false }));
    // Eliminado (D-029): aunque trae published y active en true, no debe ser público.
    await fs.doc("products/P-DELETED").set(product({ sku: "P-DELETED", slug: "eliminado", deletedAt: ts(), deletedBy: "admin-1" }));
    // Dato antiguo sin el campo deletedAt (la regla deniega: el campo es obligatorio).
    await fs.doc("products/P-OLD").set(omit(product({ sku: "P-OLD", slug: "antiguo" }), "deletedAt"));
    await fs.doc("categories/magnesio").set(category());
    await fs.doc("categories/borrador").set(category({ slug: "borrador", name: "Borrador", published: false }));
    await fs.doc("orders/NE-000001").set(order);
    await fs.doc("counters/orders").set({ last: 1, updatedAt: ts() });
    await fs.doc("settings/public").set({ ...publicSettings(), updatedAt: ts() });
    await fs.doc("settings/private").set({ ...privateSettings(), updatedAt: ts() });
    await fs.doc("settings/otro").set({ x: 1 });
    await fs.doc("metrics/daily/days/2026-10-20").set({ date: "2026-10-20", ordersCount: 1, revenue: 100, merchandise: 100, unitsSold: 1, refundsCount: 0, refundedAmount: 0, updatedAt: ts() });
    await fs.doc("metrics/products/items/2427831").set({ sku: "2427831", name: "Citrato", unitsSold: 1, revenue: 100, updatedAt: ts() });
    await fs.doc("imports/imp1").set({ kind: "catalog", rows: 1, createdBy: "admin-1", createdAt: ts() });
    await fs.doc("paymentEvents/tok1").set({ token: "tok1", orderNumber: "NE-000001", outcome: "paid", receivedCount: 1 });
    await fs.doc("idempotencyKeys/abc").set({ orderNumber: "NE-000001", createdAt: ts(), expiresAt: ts() });
    await fs.doc("rateLimits/abc").set({ count: 1, windowStart: ts(), expiresAt: ts() });
    await fs.doc("otraColeccion/x").set({ a: 1 });
    await fs.doc("contactMessages/m1").set(contactMessage);
  });
});

// ===========================================================================
// products
// ===========================================================================

describe.each(NON_ADMIN_PROFILES)("products como %s", (profile) => {
  it("lee un producto publicado y activo", async () => {
    await assertSucceeds(db(profile).doc("products/2427831").get());
  });

  it("no lee un producto sin publicar", async () => {
    await assertFails(db(profile).doc("products/P-DRAFT").get());
  });

  it("no lee un producto publicado pero inactivo", async () => {
    await assertFails(db(profile).doc("products/P-INACTIVE").get());
  });

  it("no lee un producto eliminado, aunque esté publicado y activo (D-029)", async () => {
    await assertFails(db(profile).doc("products/P-DELETED").get());
  });

  it("no lee un producto sin el campo deletedAt (dato antiguo)", async () => {
    await assertFails(db(profile).doc("products/P-OLD").get());
  });

  it("lista con los filtros published, active y deletedAt == null y obtiene solo los vigentes", async () => {
    const snap = await assertSucceeds(
      db(profile).collection("products")
        .where("published", "==", true).where("active", "==", true).where("deletedAt", "==", null).get(),
    );
    expect(snap.size).toBe(1);
    expect(snap.docs[0]?.id).toBe("2427831");
  });

  it("no lista toda la colección ni con filtros incompletos (falta deletedAt, o solo uno o dos)", async () => {
    await assertFails(db(profile).collection("products").get());
    await assertFails(db(profile).collection("products").where("published", "==", true).get());
    await assertFails(db(profile).collection("products").where("active", "==", true).get());
    await assertFails(db(profile).collection("products").where("published", "==", true).where("active", "==", true).get());
    await assertFails(db(profile).collection("products").where("published", "==", true).where("deletedAt", "==", null).get());
    await assertFails(db(profile).collection("products").where("active", "==", true).where("deletedAt", "==", null).get());
    await assertFails(db(profile).collection("products").where("deletedAt", "==", null).get());
  });

  it("no lista los eliminados, ni siquiera con los otros filtros", async () => {
    await assertFails(
      db(profile).collection("products")
        .where("published", "==", true).where("active", "==", true).where("deletedAt", "!=", null).get(),
    );
  });

  it("no puede eliminar ni restaurar por escritura directa", async () => {
    await assertFails(db(profile).doc("products/2427831").update({ deletedAt: serverNow(), deletedBy: "user-1", updatedAt: serverNow() }));
    await assertFails(db(profile).doc("products/P-DELETED").update({ deletedAt: null, deletedBy: null, updatedAt: serverNow() }));
  });

  it("no lista productos sin stock para ver los no publicados", async () => {
    await assertFails(db(profile).collection("products").where("stock", "==", 0).get());
  });

  it("no crea, ni edita (precio, stock, nombre) ni borra", async () => {
    await assertFails(db(profile).doc("products/NUEVO").set(product({ sku: "NUEVO" })));
    await assertFails(db(profile).doc("products/2427831").update({ price: 1, finalPrice: 1, updatedAt: serverNow() }));
    await assertFails(db(profile).doc("products/2427831").update({ stock: 9999, updatedAt: serverNow() }));
    await assertFails(db(profile).doc("products/2427831").update({ name: "Hackeado", updatedAt: serverNow() }));
    await assertFails(db(profile).doc("products/2427831").delete());
  });
});

describe("products como admin", () => {
  it("lee todos, publicados o no, y lista sin filtros", async () => {
    await assertSucceeds(db("admin").doc("products/P-DRAFT").get());
    await assertSucceeds(db("admin").doc("products/P-INACTIVE").get());
    const snap = await assertSucceeds(db("admin").collection("products").get());
    expect(snap.size).toBe(5);
    await assertSucceeds(db("admin").collection("products").where("stock", "==", 0).get());
  });

  it("lee y lista productos eliminados (D-029) y también los vigentes", async () => {
    await assertSucceeds(db("admin").doc("products/P-DELETED").get());
    const deleted = await assertSucceeds(db("admin").collection("products").where("deletedAt", "!=", null).get());
    expect(deleted.size).toBe(1);
    expect(deleted.docs[0]?.id).toBe("P-DELETED");
    const live = await assertSucceeds(db("admin").collection("products").where("deletedAt", "==", null).get());
    expect(live.size).toBe(3);
  });

  it("puede editar el contenido de un producto eliminado, pero no restaurarlo ni eliminarlo", async () => {
    await assertSucceeds(db("admin").doc("products/P-DELETED").update({ description: "Texto", updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/P-DELETED").update({ deletedAt: null, deletedBy: null, updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/2427831").update({ deletedAt: serverNow(), deletedBy: "admin-1", updatedAt: serverNow() }));
  });

  it("edita campos de contenido con updatedAt = hora del servidor", async () => {
    await assertSucceeds(db("admin").doc("products/2427831").update({ name: "Citrato de Magnesio 120", updatedAt: serverNow() }));
    await assertSucceeds(
      db("admin").doc("products/2427831").update({
        description: "Nuevo texto",
        shortDescription: "Corto",
        images: [{ path: "products/2427831/k3f9a1b2c3.webp", alt: "Frasco" }],
        format: "capsulas",
        unitsPerPack: 90,
        seo: { title: "Título", description: "Descripción" },
        updatedAt: serverNow(),
      }),
    );
  });

  it("permite poner descripción, descripción corta, formato, categoría y seo en null", async () => {
    await assertSucceeds(
      db("admin").doc("products/2427831").update({
        description: null, shortDescription: null, format: null, unitsPerPack: null, categoryId: null, seo: null,
        updatedAt: serverNow(),
      }),
    );
  });

  it("cambia la categoría a una que existe y falla con una que no existe", async () => {
    await assertSucceeds(db("admin").doc("products/2427831").update({ categoryId: "borrador", updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/2427831").update({ categoryId: "no-existe", updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/2427831").update({ categoryId: "Mal Slug", updatedAt: serverNow() }));
  });

  it.each([
    ["price", 1],
    ["discount", { type: "percent", value: 10 }],
    ["finalPrice", 1],
    ["stock", 999],
    ["reserved", 0],
    ["inStock", false],
    ["active", false],
    ["published", false],
    ["publishedAt", null],
    ["deletedAt", serverNow()],
    ["deletedAt", clientNow()],
    ["deletedBy", "admin-1"],
    ["sku", "OTRO"],
    ["sourceName", "OTRO NOMBRE"],
    ["source", "manual"],
    ["barcode", "123"],
    ["gtin", "123"],
    ["createdAt", clientNow()],
    ["campoInventado", 1],
  ])("falla al escribir directamente %s", async (fieldName, value) => {
    await assertFails(db("admin").doc("products/2427831").update({ [fieldName]: value, updatedAt: serverNow() }));
  });

  it("falla al poner en null deletedAt o deletedBy de un producto eliminado (P-DELETED tiene valores no nulos)", async () => {
    await assertFails(db("admin").doc("products/P-DELETED").update({ deletedAt: null, updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/P-DELETED").update({ deletedBy: null, updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/P-DELETED").update({ deletedAt: null, deletedBy: null, updatedAt: serverNow() }));
  });

  it("falla si mezcla contenido con precio o stock en la misma escritura", async () => {
    await assertFails(db("admin").doc("products/2427831").update({ name: "Nuevo", price: 1, updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/2427831").update({ name: "Nuevo", stock: 0, updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/2427831").update({ name: "Nuevo", deletedAt: serverNow(), updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/2427831").update({ name: "Nuevo", deletedBy: "admin-1", updatedAt: serverNow() }));
  });

  it("falla al borrar los campos deletedAt y deletedBy (FieldValue.delete)", async () => {
    await assertFails(db("admin").doc("products/2427831").update({ deletedAt: FieldValue.delete(), updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/2427831").update({ deletedBy: FieldValue.delete(), updatedAt: serverNow() }));
    await assertFails(
      db("admin").doc("products/2427831").update({ name: "Nuevo", deletedAt: FieldValue.delete(), deletedBy: FieldValue.delete(), updatedAt: serverNow() }),
    );
  });

  it("falla si updatedAt falta o no es la hora del servidor", async () => {
    await assertFails(db("admin").doc("products/2427831").update({ name: "Nuevo" }));
    await assertFails(db("admin").doc("products/2427831").update({ name: "Nuevo", updatedAt: clientNow() }));
    await assertFails(db("admin").doc("products/2427831").update({ name: "Nuevo", updatedAt: ts() }));
  });

  it("valida nombre, textos, imágenes, unitsPerPack y seo; family ya no se escribe (D-040)", async () => {
    const upd = (data: Record<string, unknown>) => db("admin").doc("products/2427831").update({ ...data, updatedAt: serverNow() });
    await assertFails(upd({ name: "" }));
    await assertFails(upd({ name: "x".repeat(121) }));
    await assertFails(upd({ name: 123 }));
    await assertFails(upd({ name: null }));
    await assertFails(upd({ description: "x".repeat(5001) }));
    await assertFails(upd({ description: 5 }));
    await assertFails(upd({ shortDescription: "x".repeat(301) }));
    await assertFails(upd({ images: Array.from({ length: 9 }, (_, i) => ({ path: `products/2427831/img${i}aaaaaa.webp`, alt: "a" })) }));
    await assertFails(upd({ images: "no-es-lista" }));
    await assertFails(upd({ images: null }));
    await assertFails(upd({ unitsPerPack: 0 }));
    await assertFails(upd({ unitsPerPack: 1001 }));
    await assertFails(upd({ unitsPerPack: 1.5 }));
    await assertFails(upd({ unitsPerPack: "90" }));
    await assertFails(upd({ family: "citrato-de-magnesio" }));
    await assertFails(upd({ family: null }));
    await assertFails(upd({ format: "" }));
    await assertFails(upd({ format: "x".repeat(41) }));
    await assertSucceeds(upd({ format: "x".repeat(40) }));
    await assertFails(upd({ seo: { title: "x".repeat(71) } }));
    await assertFails(upd({ seo: { description: "x".repeat(171) } }));
    await assertFails(upd({ seo: { title: "ok", extra: "no" } }));
    await assertFails(upd({ seo: "texto" }));
    await assertSucceeds(upd({ images: Array.from({ length: 8 }, (_, i) => ({ path: `products/2427831/img${i}aaaaaa.webp`, alt: "a" })) }));
  });

  it("no cambia el slug de un producto publicado, pero sí el de uno sin publicar", async () => {
    await assertFails(db("admin").doc("products/2427831").update({ slug: "otro-slug", updatedAt: serverNow() }));
    await assertFails(db("admin").doc("products/2427831").update({ slug: null, updatedAt: serverNow() }));
    await assertSucceeds(db("admin").doc("products/P-DRAFT").update({ slug: "nuevo-slug-valido", updatedAt: serverNow() }));
  });

  it("valida el formato del slug en un producto sin publicar", async () => {
    const upd = (slug: unknown) => db("admin").doc("products/P-DRAFT").update({ slug, updatedAt: serverNow() });
    await assertFails(upd("Con Mayúsculas"));
    await assertFails(upd("doble--guion"));
    await assertFails(upd("-empieza-con-guion"));
    await assertFails(upd(""));
    await assertFails(upd("a".repeat(81)));
    await assertFails(upd(5));
    await assertSucceeds(upd("slug-valido-1"));
  });

  it("no crea ni borra productos", async () => {
    await assertFails(db("admin").doc("products/NUEVO").set(product({ sku: "NUEVO", createdAt: serverNow(), updatedAt: serverNow() })));
    await assertFails(db("admin").doc("products/2427831").delete());
    await assertFails(db("admin").doc("products/P-DRAFT").delete());
  });

  it("no puede reemplazar el documento completo con set (cambiaría campos del servidor)", async () => {
    await assertFails(db("admin").doc("products/2427831").set(product({ price: 1, finalPrice: 1, updatedAt: serverNow() })));
  });
});

// ===========================================================================
// categories
// ===========================================================================

describe.each(NON_ADMIN_PROFILES)("categories como %s", (profile) => {
  it("lee una categoría publicada y lista las publicadas", async () => {
    await assertSucceeds(db(profile).doc("categories/magnesio").get());
    const snap = await assertSucceeds(db(profile).collection("categories").where("published", "==", true).get());
    expect(snap.size).toBe(1);
  });

  it("no lee una sin publicar ni lista sin el filtro", async () => {
    await assertFails(db(profile).doc("categories/borrador").get());
    await assertFails(db(profile).collection("categories").get());
  });

  it("no crea, edita ni borra", async () => {
    await assertFails(db(profile).doc("categories/nueva").set(category({ slug: "nueva", createdAt: serverNow(), updatedAt: serverNow() })));
    await assertFails(db(profile).doc("categories/magnesio").update({ name: "X", updatedAt: serverNow() }));
    await assertFails(db(profile).doc("categories/magnesio").delete());
  });
});

describe("categories como admin", () => {
  const newCat = (over: Record<string, unknown> = {}) => category({ slug: "nueva", name: "Nueva", createdAt: serverNow(), updatedAt: serverNow(), ...over });

  it("lee todas, también las sin publicar", async () => {
    await assertSucceeds(db("admin").doc("categories/borrador").get());
    const snap = await assertSucceeds(db("admin").collection("categories").get());
    expect(snap.size).toBe(2);
  });

  it("crea una categoría válida", async () => {
    await assertSucceeds(db("admin").doc("categories/nueva").set(newCat()));
    await assertSucceeds(
      db("admin").doc("categories/con-imagen").set(
        newCat({ slug: "con-imagen", imagePath: "categories/con-imagen/k3f9a1b2c3.webp", description: "Texto", seo: { title: "T" } }),
      ),
    );
  });

  it("rechaza datos inválidos al crear", async () => {
    const set = (over: Record<string, unknown>, id = "nueva") => db("admin").doc(`categories/${id}`).set(newCat(over));
    await assertFails(set({ slug: "otra" })); // slug distinto del ID
    await assertFails(set({ slug: "Mala Cat" }, "Mala Cat"));
    await assertFails(set({ name: "" }));
    await assertFails(set({ name: "x".repeat(81) }));
    await assertFails(set({ description: "x".repeat(2001) }));
    await assertFails(set({ order: -1 }));
    await assertFails(set({ order: 10000 }));
    await assertFails(set({ order: 1.5 }));
    await assertFails(set({ published: "si" }));
    await assertFails(set({ imagePath: "products/x/y.webp" }));
    await assertFails(set({ imagePath: "categories/otra/k3f9a1b2c3.webp" }));
    await assertFails(set({ seo: { title: "x".repeat(71) } }));
    await assertFails(set({ extra: 1 }));
    await assertFails(set({ createdAt: clientNow() }));
    await assertFails(set({ updatedAt: clientNow() }));
  });

  it("falla si falta un campo obligatorio", async () => {
    await assertFails(db("admin").doc("categories/nueva").set(omit(newCat(), "name")));
  });

  it("edita con updatedAt del servidor; slug y createdAt inmutables", async () => {
    await assertSucceeds(db("admin").doc("categories/magnesio").update({ name: "Magnesio y más", order: 25, updatedAt: serverNow() }));
    await assertFails(db("admin").doc("categories/magnesio").update({ slug: "otro", updatedAt: serverNow() }));
    await assertFails(db("admin").doc("categories/magnesio").update({ createdAt: serverNow(), updatedAt: serverNow() }));
    await assertFails(db("admin").doc("categories/magnesio").update({ name: "X", updatedAt: clientNow() }));
    await assertFails(db("admin").doc("categories/magnesio").update({ name: "" , updatedAt: serverNow() }));
  });

  it("borra categorías (D-040)", async () => {
    await assertSucceeds(db("admin").doc("categories/magnesio").delete());
    await assertSucceeds(db("admin").doc("categories/borrador").delete());
  });

  it("deja un producto sin categoría y borra la categoría en el mismo lote", async () => {
    const batch = db("admin").batch();
    batch.update(db("admin").doc("products/2427831"), { categoryId: null, updatedAt: serverNow() });
    batch.delete(db("admin").doc("categories/magnesio"));
    await assertSucceeds(batch.commit());
  });
});

// ===========================================================================
// orders (datos personales: RUT, correo, teléfono, dirección)
// ===========================================================================

describe.each(NON_ADMIN_PROFILES)("orders como %s", (profile) => {
  it("no lee un pedido ni siquiera por su ID", async () => {
    await assertFails(db(profile).doc("orders/NE-000001").get());
  });

  it("no lista pedidos ni busca por RUT, correo o token", async () => {
    await assertFails(db(profile).collection("orders").get());
    await assertFails(db(profile).collection("orders").where("customer.rut", "==", "12345678-5").get());
    await assertFails(db(profile).collection("orders").where("customer.email", "==", "ana@example.com").get());
    await assertFails(db(profile).collection("orders").where("accessTokenHash", "==", "abc").get());
    await assertFails(db(profile).collectionGroup("orders").get());
  });

  it("no crea un pedido, ni siquiera con precio manipulado", async () => {
    await assertFails(db(profile).doc("orders/NE-000002").set({ ...order, orderNumber: "NE-000002", total: 1, subtotal: 1, paymentStatus: "paid" }));
  });

  it("no edita ni borra un pedido", async () => {
    await assertFails(db(profile).doc("orders/NE-000001").update({ paymentStatus: "paid" }));
    await assertFails(db(profile).doc("orders/NE-000001").update({ total: 1 }));
    await assertFails(db(profile).doc("orders/NE-000001").delete());
  });
});

describe("orders como admin", () => {
  it("lee un pedido y lista con paginación", async () => {
    await assertSucceeds(db("admin").doc("orders/NE-000001").get());
    await assertSucceeds(db("admin").collection("orders").orderBy("createdAt", "desc").limit(25).get());
  });

  it("no escribe pedidos: ni paymentStatus, refund, statusHistory, ni crea ni borra", async () => {
    await assertFails(db("admin").doc("orders/NE-000001").update({ paymentStatus: "paid" }));
    await assertFails(db("admin").doc("orders/NE-000001").update({ paymentStatus: "refunded" }));
    await assertFails(db("admin").doc("orders/NE-000001").update({ refund: { amount: 1000 } }));
    await assertFails(db("admin").doc("orders/NE-000001").update({ statusHistory: [] }));
    await assertFails(db("admin").doc("orders/NE-000001").update({ total: 1 }));
    await assertFails(db("admin").doc("orders/NE-000002").set({ ...order, orderNumber: "NE-000002" }));
    await assertFails(db("admin").doc("orders/NE-000001").delete());
  });
});

// ===========================================================================
// contactMessages: solo el servidor crea; el admin lee, marca, archiva y elimina
// ===========================================================================

describe.each(NON_ADMIN_PROFILES)("contactMessages como %s", (profile) => {
  it("no lee, ni lista, ni crea, ni edita, ni borra", async () => {
    await assertFails(db(profile).doc("contactMessages/m1").get());
    await assertFails(db(profile).collection("contactMessages").get());
    await assertFails(db(profile).doc("contactMessages/m2").set({ ...contactMessage, createdAt: serverNow(), updatedAt: serverNow() }));
    await assertFails(db(profile).doc("contactMessages/m1").update({ read: true, updatedAt: serverNow() }));
    await assertFails(db(profile).doc("contactMessages/m1").delete());
  });
});

describe("contactMessages como admin", () => {
  it("lee y lista por fecha", async () => {
    await assertSucceeds(db("admin").doc("contactMessages/m1").get());
    await assertSucceeds(db("admin").collection("contactMessages").orderBy("createdAt", "desc").limit(500).get());
  });

  it("marca leído y archiva con updatedAt del servidor", async () => {
    await assertSucceeds(db("admin").doc("contactMessages/m1").update({ read: true, updatedAt: serverNow() }));
    await assertSucceeds(db("admin").doc("contactMessages/m1").update({ archived: true, read: false, updatedAt: serverNow() }));
  });

  it("no edita el contenido, ni usa tipos inválidos, ni omite updatedAt, ni crea", async () => {
    await assertFails(db("admin").doc("contactMessages/m1").update({ message: "otro", updatedAt: serverNow() }));
    await assertFails(db("admin").doc("contactMessages/m1").update({ email: "x@y.cl", updatedAt: serverNow() }));
    await assertFails(db("admin").doc("contactMessages/m1").update({ read: "si", updatedAt: serverNow() }));
    await assertFails(db("admin").doc("contactMessages/m1").update({ read: true }));
    await assertFails(db("admin").doc("contactMessages/m1").update({ read: true, updatedAt: clientNow() }));
    await assertFails(db("admin").doc("contactMessages/m2").set({ ...contactMessage, createdAt: serverNow(), updatedAt: serverNow() }));
  });

  it("elimina", async () => {
    await assertSucceeds(db("admin").doc("contactMessages/m1").delete());
  });
});

// ===========================================================================
// counters
// ===========================================================================

describe.each([...NON_ADMIN_PROFILES, "admin" as Profile])("counters como %s", (profile) => {
  it("no lee, ni escribe, ni borra", async () => {
    await assertFails(db(profile).doc("counters/orders").get());
    await assertFails(db(profile).collection("counters").get());
    await assertFails(db(profile).doc("counters/orders").set({ last: 0, updatedAt: serverNow() }));
    await assertFails(db(profile).doc("counters/orders").update({ last: 0 }));
    await assertFails(db(profile).doc("counters/orders").delete());
  });
});

// ===========================================================================
// settings
// ===========================================================================

describe.each(NON_ADMIN_PROFILES)("settings como %s", (profile) => {
  it("lee settings/public", async () => {
    await assertSucceeds(db(profile).doc("settings/public").get());
  });

  it("no lee settings/private, ni lista settings, ni lee otro documento", async () => {
    await assertFails(db(profile).doc("settings/private").get());
    await assertFails(db(profile).collection("settings").get());
    await assertFails(db(profile).doc("settings/otro").get());
  });

  it("settings/public: get sí, list no (D-027)", async () => {
    await assertSucceeds(db(profile).doc("settings/public").get());
    await assertFails(db(profile).collection("settings").where("updatedAt", ">", ts()).get());
  });

  it("no escribe ni borra ningún setting", async () => {
    await assertFails(db(profile).doc("settings/public").update({ shippingFee: 0, updatedAt: serverNow() }));
    await assertFails(db(profile).doc("settings/public").set(publicSettings({ shippingFee: 0 })));
    await assertFails(db(profile).doc("settings/private").update({ orderNumberStart: 5, updatedAt: serverNow() }));
    await assertFails(db(profile).doc("settings/public").delete());
  });
});

describe("settings/public como admin", () => {
  const set = (over: Record<string, unknown>) => db("admin").doc("settings/public").set(publicSettings(over));

  it("lee y escribe un documento válido", async () => {
    await assertSucceeds(db("admin").doc("settings/public").get());
    await assertSucceeds(set({}));
    await assertSucceeds(set({ freeShippingThreshold: 50000, shippingFee: 0, maxQtyPerItem: 100 }));
  });

  it("acepta hasta 400 comunas", async () => {
    await assertSucceeds(set({ communes: Array.from({ length: 400 }, (_, i) => ({ code: `c-${i}`, name: `Comuna ${i}` })) }));
  });

  it("rechaza valores fuera de rango o de tipo incorrecto", async () => {
    await assertFails(set({ shippingFee: -1 }));
    await assertFails(set({ shippingFee: 100001 }));
    await assertFails(set({ shippingFee: 3990.5 }));
    await assertFails(set({ shippingFee: "3990" }));
    await assertFails(set({ freeShippingThreshold: 0 }));
    await assertFails(set({ freeShippingThreshold: 10000001 }));
    await assertFails(set({ freeShippingThreshold: "50000" }));
    await assertFails(set({ communes: [] }));
    await assertFails(set({ communes: Array.from({ length: 401 }, (_, i) => ({ code: `c-${i}`, name: `Comuna ${i}` })) }));
    await assertFails(set({ communes: "todas" }));
    await assertFails(set({ pickup: { enabled: "si", address: "x", hours: "y" } }));
    await assertFails(set({ pickup: { enabled: true, address: "x".repeat(201), hours: "y" } }));
    await assertFails(set({ pickup: { enabled: true, address: "x" } }));
    await assertFails(set({ pickup: { enabled: true, address: "x", hours: "y", extra: 1 } }));
    await assertFails(set({ maxQtyPerItem: 0 }));
    await assertFails(set({ maxQtyPerItem: 101 }));
  });

  it("rechaza campos extra, faltantes y updatedAt del cliente", async () => {
    await assertFails(set({ campoExtra: 1 }));
    await assertFails(set({ updatedAt: clientNow() }));
    await assertFails(db("admin").doc("settings/public").set(omit(publicSettings(), "shippingFee")));
  });

  it("no borra", async () => {
    await assertFails(db("admin").doc("settings/public").delete());
  });
});

describe("settings/private como admin", () => {
  const set = (over: Record<string, unknown>) => db("admin").doc("settings/private").set(privateSettings(over));

  it("lee y escribe un documento válido", async () => {
    await assertSucceeds(db("admin").doc("settings/private").get());
    await assertSucceeds(set({}));
    await assertSucceeds(set({ limits: { createOrderPerIpPer10Min: 10 } })); // valores ausentes usan el inicial
  });

  it("rechaza tiempos de reserva e límites fuera de rango", async () => {
    await assertFails(set({ reservationMinutes: { flow: 4, transfer: 2880 } }));
    await assertFails(set({ reservationMinutes: { flow: 241, transfer: 2880 } }));
    await assertFails(set({ reservationMinutes: { flow: 30, transfer: 59 } }));
    await assertFails(set({ reservationMinutes: { flow: 30, transfer: 10081 } }));
    await assertFails(set({ reservationMinutes: { flow: 30 } }));
    await assertFails(set({ orderNumberStart: 0 }));
    await assertFails(set({ orderNumberStart: 100000001 }));
    await assertSucceeds(set({ orderNumberStart: 100000000 }));
    await assertFails(set({ orderNumberStart: 1.5 }));
    await assertFails(set({ limits: { createOrderPerIpPer10Min: 0 } }));
    await assertFails(set({ limits: { pendingOrdersPerEmail: 51 } }));
    await assertFails(set({ limits: { inventado: 1 } }));
  });

  it("admite flowConfirmPerIpPer10Min (1..10000, entero) y orderStatusPerIpPer10Min hasta 1000", async () => {
    await assertSucceeds(set({ limits: { flowConfirmPerIpPer10Min: 300 } }));
    await assertSucceeds(set({ limits: { flowConfirmPerIpPer10Min: 1 } }));
    await assertSucceeds(set({ limits: { flowConfirmPerIpPer10Min: 10000 } }));
    await assertFails(set({ limits: { flowConfirmPerIpPer10Min: 0 } }));
    await assertFails(set({ limits: { flowConfirmPerIpPer10Min: 10001 } }));
    await assertFails(set({ limits: { flowConfirmPerIpPer10Min: 1.5 } }));
    await assertFails(set({ limits: { flowConfirmPerIpPer10Min: "300" } }));
    await assertSucceeds(set({ limits: { orderStatusPerIpPer10Min: 120 } }));
    await assertSucceeds(set({ limits: { orderStatusPerIpPer10Min: 1000 } }));
    await assertFails(set({ limits: { orderStatusPerIpPer10Min: 1001 } }));
  });

  it("valida los datos bancarios", async () => {
    const bank = privateSettings().bank;
    await assertFails(set({ bank: { ...bank, bankName: "" } }));
    await assertFails(set({ bank: { ...bank, accountNumber: "x".repeat(101) } }));
    await assertFails(set({ bank: { ...bank, extra: "no" } }));
    await assertFails(set({ bank: "texto" }));
    await assertFails(set({ bank: omit(bank, "holderRut") }));
    await assertSucceeds(set({ bank: { ...bank, contactEmail: "pagos@example.com" } }));
  });

  it("rechaza campos extra y updatedAt del cliente; no borra", async () => {
    await assertFails(set({ campoExtra: 1 }));
    await assertFails(set({ updatedAt: clientNow() }));
    await assertFails(db("admin").doc("settings/private").delete());
  });

  it("no crea otros documentos en settings", async () => {
    await assertFails(db("admin").doc("settings/otro").get());
    await assertFails(db("admin").doc("settings/nuevo").set({ x: 1 }));
    await assertFails(db("admin").collection("settings").get());
  });
});

// ===========================================================================
// metrics, imports, paymentEvents (admin lee, nadie escribe)
// ===========================================================================

const adminReadOnly: Array<[string, string, string]> = [
  ["metrics/daily/days/2026-10-20", "metrics/daily/days", "metrics"],
  ["metrics/products/items/2427831", "metrics/products/items", "metrics"],
  ["imports/imp1", "imports", "imports"],
  ["paymentEvents/tok1", "paymentEvents", "paymentEvents"],
];

describe.each(adminReadOnly)("%s (colección %s)", (docPath, colPath) => {
  describe.each(NON_ADMIN_PROFILES)("como %s", (profile) => {
    it("no lee ni lista", async () => {
      await assertFails(db(profile).doc(docPath).get());
      await assertFails(db(profile).collection(colPath).get());
    });
    it("no escribe ni borra", async () => {
      await assertFails(db(profile).doc(docPath).set({ x: 1 }));
      await assertFails(db(profile).doc(docPath).update({ revenue: 999999 }));
      await assertFails(db(profile).doc(docPath).delete());
      await assertFails(db(profile).doc(`${colPath}/nuevo`).set({ x: 1 }));
    });
  });

  describe("como admin", () => {
    it("lee y lista", async () => {
      await assertSucceeds(db("admin").doc(docPath).get());
      await assertSucceeds(db("admin").collection(colPath).limit(25).get());
    });
    it("no escribe ni borra (solo el servidor)", async () => {
      await assertFails(db("admin").doc(docPath).set({ x: 1 }));
      await assertFails(db("admin").doc(docPath).update({ revenue: 999999 }));
      await assertFails(db("admin").doc(docPath).delete());
      await assertFails(db("admin").doc(`${colPath}/nuevo`).set({ x: 1 }));
    });
  });
});

describe("metrics: documentos padre y consulta de más vendidos", () => {
  it("el admin lee los más vendidos; el público no", async () => {
    await assertSucceeds(db("admin").collection("metrics/products/items").orderBy("unitsSold", "desc").limit(10).get());
    await assertFails(db("anonymous").collection("metrics/products/items").orderBy("unitsSold", "desc").limit(10).get());
    await assertFails(db("user").collectionGroup("items").get());
  });
});

// ===========================================================================
// idempotencyKeys y rateLimits (sin acceso, ni el admin)
// ===========================================================================

describe.each([...NON_ADMIN_PROFILES, "admin" as Profile])("idempotencyKeys y rateLimits como %s", (profile) => {
  it("no lee, no lista, no escribe ni borra", async () => {
    for (const path of ["idempotencyKeys/abc", "rateLimits/abc"]) {
      await assertFails(db(profile).doc(path).get());
      await assertFails(db(profile).doc(path).set({ count: 0 }));
      await assertFails(db(profile).doc(path).update({ count: 0 }));
      await assertFails(db(profile).doc(path).delete());
    }
    await assertFails(db(profile).collection("idempotencyKeys").get());
    await assertFails(db(profile).collection("rateLimits").get());
  });
});

// ===========================================================================
// Rutas no declaradas
// ===========================================================================

describe.each([...NON_ADMIN_PROFILES, "admin" as Profile])("ruta no declarada como %s", (profile) => {
  it("deniega lectura y escritura", async () => {
    await assertFails(db(profile).doc("otraColeccion/x").get());
    await assertFails(db(profile).collection("otraColeccion").get());
    await assertFails(db(profile).doc("otraColeccion/nuevo").set({ a: 1 }));
    await assertFails(db(profile).doc("users/u1").set({ role: "admin" }));
    await assertFails(db(profile).doc("posts/p1").get());
    await assertFails(db(profile).doc("products/2427831/privado/x").get());
    await assertFails(db(profile).doc("products/2427831/privado/x").set({ a: 1 }));
  });
});

describe("escalada de privilegios", () => {
  it("un usuario no se otorga el claim admin escribiendo un documento", async () => {
    await assertFails(db("user").doc("users/user-1").set({ admin: true }));
    await assertFails(db("user").doc("settings/private").get());
  });

  it("un token con admin distinto de true (cadena) no es admin", async () => {
    const ctx = env.authenticatedContext("user-3", { admin: "true" });
    await assertFails(ctx.firestore().doc("settings/private").get());
    await assertFails(ctx.firestore().doc("orders/NE-000001").get());
  });
});
