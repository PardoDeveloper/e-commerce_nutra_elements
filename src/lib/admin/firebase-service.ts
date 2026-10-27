// AdminService real sobre Firebase (D-031). SOLO cliente, y solo después de iniciar sesión como admin.
//
// Mecanismo por operación (la seguridad real está en las reglas de Firestore/Storage y en las Functions):
//  - Lecturas (products, orders, metrics, settings): SDK de cliente con `onSnapshot` como admin.
//  - Contenido de producto: `updateDoc` directo con solo los campos permitidos + `updatedAt: serverTimestamp()`.
//  - Precio, stock, publicar, eliminar/restaurar, importaciones, descuentos, crear: callables (firebase-callables.ts).
//  - Imágenes: compresión a WebP en el navegador, `uploadBytes` a Storage y `updateDoc` de contenido con `images`.
//  - Pedidos: callables del contrato. Ajustes: escritura directa en settings/public y settings/private.
//  - Credenciales de Flow: callables solo-admin que escriben en Secret Manager (D-035); nunca se leen los valores.
import { FirebaseError } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { deleteObject, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import { getFirebaseDb, getFirebaseStorage } from "@/lib/firebase/client";
import { createFirestoreOrderHistory } from "./firebase-order-history";
import { MAX_BYTES } from "./image";
import { planApplyDiscount, planImportCatalog, planImportPrices, planImportStock, type BatchPlan } from "./batch";
import {
  createCatalogCallables,
  createFirebaseInvoker,
  createFlowCredentialsCallables,
  createOrderCallables,
  FUNCTION_UNAVAILABLE_MESSAGE,
  type CallableInvoker,
} from "./firebase-callables";
import {
  buildContentUpdate,
  buildSettingsWrites,
  DEFAULT_SETTINGS,
  mapAdminCategory,
  mapDailyMetric,
  mapOrder,
  mapProduct,
  mapTopProduct,
  mergeSettings,
  storageUrl,
  validateContentPatch,
  type Doc,
} from "./firebase-mappers";
import { cleanCategoryName, newCategorySlug, nextCategoryOrder, renamedCategorySlug, sortCategories } from "./categories";
import { AdminServiceError } from "./errors";
import { buildInitialCategories, buildInitialPrivateSettings, buildInitialPublicSettings } from "./firebase-seed";
import { validateSettings } from "./demo-service";
import type { AdminService, AdminState, OrderActionResponse } from "./service";
import type { AdminImage, AdminOrder, BatchReport, DailyMetric, TopProduct } from "./types";

/** Pedidos más recientes que se escuchan en vivo (el contrato pide paginar: aquí se acota). */
export const ORDERS_LIMIT = 200;
/** Días de métricas diarias que se leen (el panel muestra hasta 90). */
export const METRIC_DAYS_LIMIT = 90;
/** Espera máxima a que el listener refleje el cambio hecho por una Function. */
const SYNC_WAIT_MS = 3000;

export interface FirebaseAdminDeps {
  db: Firestore;
  storage: FirebaseStorage;
  invoke: CallableInvoker;
  /** Bucket de Storage (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET), para las URL públicas de las imágenes. */
  bucket: string;
}

/** Traduce los errores de Firestore y Storage a mensajes en español. */
export function mapSdkError(error: unknown): AdminServiceError {
  if (error instanceof AdminServiceError) return error;
  const code = error instanceof FirebaseError ? error.code : typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "permission-denied" || code === "storage/unauthorized") {
    return new AdminServiceError(
      "PERMISSION_DENIED",
      "Sin permiso: tu cuenta no es administradora o los datos no cumplen las reglas de seguridad (por ejemplo, una categoría que no existe).",
    );
  }
  if (code === "unauthenticated" || code === "storage/unauthenticated") {
    return new AdminServiceError("UNAUTHENTICATED", "Tu sesión expiró. Vuelve a iniciar sesión.");
  }
  if (code === "unavailable" || code === "deadline-exceeded" || code === "storage/retry-limit-exceeded") {
    return new AdminServiceError("NETWORK", "No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.");
  }
  if (code === "not-found") return new AdminServiceError("SKU_NOT_FOUND", "El documento no existe.");
  if (code === "storage/quota-exceeded") return new AdminServiceError("STORAGE_QUOTA", "Se agotó el espacio de almacenamiento.");
  return new AdminServiceError("INTERNAL", "Ocurrió un error inesperado. Inténtalo de nuevo.");
}

/** ¿El reporte indica que el servidor escribió algo? (una vista previa o un lote sin cambios no escribe). */
const reportWrote = (r: BatchReport): boolean => !r.dryRun && r.created + r.updated > 0;

function randomId(): string {
  // 24 caracteres [a-z0-9]: cumple `^[A-Za-z0-9_-]{8,40}$` de las reglas de Storage.
  return crypto.randomUUID().replaceAll("-", "").slice(0, 24);
}

export function createFirebaseAdminService(deps: FirebaseAdminDeps): AdminService {
  const { db, storage, invoke, bucket } = deps;
  const catalog = createCatalogCallables(invoke);
  const orderCalls = createOrderCallables(invoke);
  const flowCredentials = createFlowCredentialsCallables(invoke);

  // ---------- Estado ----------
  let state: AdminState = { products: [], categories: [], orders: [], settings: DEFAULT_SETTINGS, status: "loading", metrics: null };
  const listeners = new Set<() => void>();
  const loaded = { products: false, orders: false, settingsPublic: false, settingsPrivate: false };
  let rawPublic: Doc | null = null;
  let rawPrivate: Doc | null = null;
  let metricDays: DailyMetric[] = [];
  let topProducts: TopProduct[] = [];
  let productsVersion = 0;
  const unsubscribers: Unsubscribe[] = [];
  let disposed = false;

  function commit(next: Partial<AdminState>): void {
    if (disposed) return;
    state = { ...state, ...next };
    if (state.status === "loading" && loaded.products && loaded.orders && loaded.settingsPublic && loaded.settingsPrivate) {
      state = { ...state, status: "ready" };
    }
    listeners.forEach((l) => l());
  }

  function fail(source: string, error: unknown): void {
    const mapped = mapSdkError(error);
    // Un error de lectura deja el panel inservible: se informa y se frena la carga.
    commit({ status: "error", loadError: `${mapped.message} (lectura de ${source})` });
  }

  function recomputeSettings(): void {
    commit({ settings: mergeSettings(rawPublic, rawPrivate), settingsMissing: rawPublic === null, settingsPrivateMissing: rawPrivate === null });
  }

  function recomputeMetrics(): void {
    commit({ metrics: metricDays.length > 0 || topProducts.length > 0 ? { days: metricDays, top: topProducts } : null });
  }

  // ---------- Listeners ----------
  unsubscribers.push(
    onSnapshot(
      collection(db, "products"),
      (snap) => {
        productsVersion++;
        loaded.products = true;
        commit({ products: snap.docs.map((d) => mapProduct(d.id, d.data({ serverTimestamps: "estimate" }), bucket)) });
      },
      (error) => fail("productos", error),
    ),
    onSnapshot(
      query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(ORDERS_LIMIT)),
      (snap) => {
        loaded.orders = true;
        commit({ orders: snap.docs.map((d) => mapOrder(d.id, d.data({ serverTimestamps: "estimate" }))) });
      },
      (error) => fail("pedidos", error),
    ),
    onSnapshot(
      doc(db, "settings", "public"),
      (snap) => {
        loaded.settingsPublic = true;
        rawPublic = snap.exists() ? snap.data() : null;
        recomputeSettings();
      },
      (error) => fail("ajustes públicos", error),
    ),
    onSnapshot(
      doc(db, "settings", "private"),
      (snap) => {
        loaded.settingsPrivate = true;
        rawPrivate = snap.exists() ? snap.data() : null;
        recomputeSettings();
      },
      (error) => fail("ajustes privados", error),
    ),
    // Categorías (D-040): las administra el admin. No es crítico: si falla, el selector queda vacío.
    onSnapshot(
      collection(db, "categories"),
      (snap) => {
        commit({ categories: sortCategories(snap.docs.flatMap((d) => mapAdminCategory(d.id, d.data()) ?? [])), categoriesLoaded: true });
      },
      () => undefined,
    ),
    // Métricas: no son críticas; si fallan o no hay datos, el panel las calcula desde los pedidos.
    onSnapshot(
      query(collection(db, "metrics", "daily", "days"), orderBy("date", "desc"), limit(METRIC_DAYS_LIMIT)),
      (snap) => {
        metricDays = snap.docs.flatMap((d) => mapDailyMetric(d.data()) ?? []);
        recomputeMetrics();
      },
      () => {
        metricDays = [];
        recomputeMetrics();
      },
    ),
    onSnapshot(
      query(collection(db, "metrics", "products", "items"), orderBy("unitsSold", "desc"), limit(10)),
      (snap) => {
        topProducts = snap.docs.map((d) => mapTopProduct(d.id, d.data()));
        recomputeMetrics();
      },
      () => {
        topProducts = [];
        recomputeMetrics();
      },
    ),
  );

  // ---------- Utilidades ----------
  const productMap = () => new Map(state.products.map((p) => [p.sku, p] as const));

  /** Espera (acotada) a que un listener refleje lo que acaba de escribir una Function. */
  async function afterServerWrite(kind: "products", versionBefore: number): Promise<void> {
    const current = () => (kind === "products" ? productsVersion : 0);
    if (current() !== versionBefore) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        listeners.delete(check);
        clearTimeout(timer);
        resolve();
      };
      const check = () => {
        if (current() !== versionBefore) done();
      };
      const timer = setTimeout(done, SYNC_WAIT_MS);
      listeners.add(check);
    });
  }

  /** Ejecuta una operación que escribe productos en el servidor y espera (acotado) a verla en el listener. */
  async function mutateProducts<T>(run: () => Promise<T>, wrote: (result: T) => boolean = () => true): Promise<T> {
    const before = productsVersion;
    try {
      const result = await run();
      if (wrote(result)) await afterServerWrite("products", before);
      return result;
    } catch (error) {
      throw error instanceof AdminServiceError ? error : mapSdkError(error);
    }
  }

  /** Vista previa: el reporte es el del servidor; el detalle antes→después sale del plan local con las filas válidas. */
  function withChanges(report: BatchReport, plan: () => BatchPlan): BatchReport {
    try {
      const rejected = new Set(report.invalid.map((i) => i.row));
      return { ...report, changes: plan().report.changes.filter((c) => !rejected.has(c.row)) };
    } catch {
      return report;
    }
  }

  async function freshOrder(orderNumber: string): Promise<AdminOrder> {
    const snap = await getDoc(doc(db, "orders", orderNumber));
    if (!snap.exists()) throw new AdminServiceError("ORDER_NOT_FOUND", "El pedido no existe.");
    return mapOrder(snap.id, snap.data());
  }

  function keepExtraOrder(order: AdminOrder): void {
    commit({ extraOrders: { ...state.extraOrders, [order.orderNumber]: order } });
  }

  async function orderAction(call: () => Promise<{ changed: boolean; message?: string }>, orderNumber: string): Promise<OrderActionResponse> {
    try {
      const result = await call();
      // El pedido se relee del servidor: así la pantalla no depende de cuándo llegue el listener.
      const order = await freshOrder(orderNumber);
      // Un pedido antiguo (fuera del listener) no se actualizaría solo en la pantalla.
      if (state.extraOrders?.[orderNumber]) keepExtraOrder(order);
      return { order, changed: result.changed, message: result.message };
    } catch (error) {
      throw error instanceof AdminServiceError ? error : mapSdkError(error);
    }
  }

  // ---------- Servicio ----------
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    createOrderHistory: () => createFirestoreOrderHistory(db),
    async loadOrder(orderNumber) {
      if (!/^NE-\d{6,}$/.test(orderNumber)) return null;
      try {
        const order = await freshOrder(orderNumber);
        keepExtraOrder(order);
        return order;
      } catch (error) {
        if (error instanceof AdminServiceError && error.code === "ORDER_NOT_FOUND") return null;
        throw mapSdkError(error);
      }
    },
    dispose() {
      disposed = true;
      unsubscribers.splice(0).forEach((u) => u());
      listeners.clear();
    },

    // Catálogo: callables.
    importCatalog: (input) =>
      mutateProducts(async () => withChanges(await catalog.importCatalog(input), () => planImportCatalog(input.rows, productMap(), input)), reportWrote),
    importPrices: (input) =>
      mutateProducts(async () => withChanges(await catalog.importPrices(input), () => planImportPrices(input.rows, productMap(), input)), reportWrote),
    importStock: (input) =>
      mutateProducts(async () => withChanges(await catalog.importStock(input), () => planImportStock(input.rows, productMap(), input)), reportWrote),
    applyDiscount: (input) =>
      mutateProducts(
        async () => withChanges(await catalog.applyDiscount(input), () => planApplyDiscount(input.skus, input.discount, productMap(), input)),
        reportWrote,
      ),
    setProductsPublished: (input) => mutateProducts(() => catalog.setProductsPublished(input), reportWrote),
    deleteProducts: (input) => mutateProducts(() => catalog.deleteProducts(input), (r) => r.deleted > 0),
    restoreProducts: (input) => mutateProducts(() => catalog.restoreProducts(input), (r) => r.restored > 0),
    createProduct: (input) => mutateProducts(() => catalog.createProduct(input), (r) => r.created),
    updateProductCommerce: (input) => mutateProducts(() => catalog.updateProductCommerce(input)),

    async updateProductContent(sku, patch) {
      const current = productMap().get(sku);
      if (!current) throw new AdminServiceError("SKU_NOT_FOUND", "El SKU no existe en el catálogo.");
      validateContentPatch(current, patch);
      const data = buildContentUpdate(patch);
      if (Object.keys(data).length === 0) return;
      try {
        await updateDoc(doc(db, "products", sku), { ...data, updatedAt: serverTimestamp() });
      } catch (error) {
        throw mapSdkError(error);
      }
      // Imágenes quitadas del producto: se borra también el archivo (si falla, queda huérfano y no afecta a nadie).
      if (patch.images) {
        const kept = new Set(patch.images.map((i) => i.path));
        const prefix = `products/${sku}/`;
        await Promise.all(
          current.images
            .filter((i) => i.path.startsWith(prefix) && !kept.has(i.path))
            .map((i) => deleteObject(ref(storage, i.path)).catch(() => undefined)),
        );
      }
    },

    async uploadProductImage(sku, blob): Promise<AdminImage> {
      if (blob.type !== "image/webp") throw new AdminServiceError("INVALID_IMAGE", "La imagen debe estar en formato WebP.");
      if (blob.size <= 0 || blob.size > MAX_BYTES) throw new AdminServiceError("INVALID_IMAGE", "La imagen debe pesar como máximo 2 MiB.");
      const path = `products/${sku}/${randomId()}.webp`;
      try {
        await uploadBytes(ref(storage, path), blob, {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
        });
      } catch (error) {
        throw mapSdkError(error);
      }
      return { path, alt: "", previewUrl: storageUrl(bucket, path), bytes: blob.size };
    },

    async setProductActive() {
      // `active` viene de la planilla (ACTIVO). El contrato no tiene una función para cambiarlo a mano.
      throw new AdminServiceError("FUNCTION_UNAVAILABLE", `${FUNCTION_UNAVAILABLE_MESSAGE} «Activo» se actualiza al importar la planilla de Control Farma.`);
    },

    // Categorías: escritura directa validada por `validCategory` de las reglas (D-040).
    async createCategory({ name }) {
      const clean = cleanCategoryName(name);
      const slug = newCategorySlug(clean, state.categories);
      const order = nextCategoryOrder(state.categories);
      const categoryRef = doc(db, "categories", slug);
      try {
        // Transacción: si otra pestaña ya creó el mismo slug, no se pisa.
        await runTransaction(db, async (tx) => {
          if ((await tx.get(categoryRef)).exists()) throw new AdminServiceError("CATEGORY_EXISTS", "Ya existe una categoría con ese nombre.");
          tx.set(categoryRef, { slug, name: clean, order, published: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        });
      } catch (error) {
        throw mapSdkError(error);
      }
      return { slug };
    },

    async updateCategory(slug, { name }) {
      const clean = cleanCategoryName(name);
      if (!state.categories.some((c) => c.slug === slug)) throw new AdminServiceError("CATEGORY_NOT_FOUND", "La categoría no existe.");
      const next = renamedCategorySlug(slug, clean, state.categories);
      const oldRef = doc(db, "categories", slug);
      try {
        if (next === slug) {
          await updateDoc(oldRef, { name: clean, updatedAt: serverTimestamp() });
          return { slug };
        }
        // El slug es el ID (inmutable en las reglas): se crea la categoría con el ID nuevo, se mueven sus productos
        // y se borra la anterior. La nueva debe existir antes de mover (la regla de productos lo comprueba).
        const newRef = doc(db, "categories", next);
        await runTransaction(db, async (tx) => {
          const [old, taken] = [await tx.get(oldRef), await tx.get(newRef)];
          if (!old.exists()) throw new AdminServiceError("CATEGORY_NOT_FOUND", "La categoría no existe.");
          if (taken.exists()) throw new AdminServiceError("CATEGORY_EXISTS", "Ya existe una categoría con ese nombre.");
          const d = old.data();
          // `imagePath` queda fuera: su ruta en Storage lleva el slug anterior y las reglas la rechazarían.
          tx.set(newRef, {
            slug: next,
            name: clean,
            order: d.order,
            published: d.published,
            ...(d.description != null ? { description: d.description } : {}),
            ...(d.seo != null ? { seo: d.seo } : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        // Productos y borrado de la anterior en lotes de 400; el último lote incluye el borrado (con pocos productos,
        // todo es atómico). Si un lote falla, la anterior sigue existiendo con los productos que no alcanzaron a moverse.
        const snap = await getDocs(query(collection(db, "products"), where("categoryId", "==", slug)));
        const docs = snap.docs;
        for (let i = 0; i === 0 || i < docs.length; i += 400) {
          const batch = writeBatch(db);
          for (const d of docs.slice(i, i + 400)) batch.update(d.ref, { categoryId: next, updatedAt: serverTimestamp() });
          if (i + 400 >= docs.length) batch.delete(oldRef);
          await batch.commit();
        }
        return { slug: next };
      } catch (error) {
        throw mapSdkError(error);
      }
    },

    async deleteCategory(slug) {
      if (!state.categories.some((c) => c.slug === slug)) throw new AdminServiceError("CATEGORY_NOT_FOUND", "La categoría no existe.");
      try {
        // Primero se quitan los productos de la categoría (en lotes de 400) y al final se borra la categoría:
        // si algo falla a medias, la categoría sigue existiendo y basta con reintentar.
        const snap = await getDocs(query(collection(db, "products"), where("categoryId", "==", slug)));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = writeBatch(db);
          for (const d of snap.docs.slice(i, i + 400)) batch.update(d.ref, { categoryId: null, updatedAt: serverTimestamp() });
          await batch.commit();
        }
        await deleteDoc(doc(db, "categories", slug));
        return { productsUpdated: snap.docs.length };
      } catch (error) {
        throw mapSdkError(error);
      }
    },

    // Pedidos: callables del contrato.
    confirmTransferPayment: (input) => orderAction(() => orderCalls.confirmTransferPayment(input), input.orderNumber),
    async cancelOrder(input) {
      const wasCancelled = state.orders.find((o) => o.orderNumber === input.orderNumber)?.paymentStatus === "cancelled";
      const response = await orderAction(() => orderCalls.cancelOrder(input), input.orderNumber);
      return wasCancelled ? { ...response, changed: false } : response;
    },
    updateFulfillment: (input) => orderAction(() => orderCalls.updateFulfillment(input), input.orderNumber),
    recordManualRefund: (input) => orderAction(() => orderCalls.recordManualRefund(input), input.orderNumber),

    // Ajustes: escritura directa validada por las reglas.
    async saveSettings(settings) {
      validateSettings(settings);
      const { publicDoc, privateDoc } = buildSettingsWrites(settings, rawPublic, rawPrivate);
      const batch = writeBatch(db);
      batch.set(doc(db, "settings", "public"), { ...publicDoc, updatedAt: serverTimestamp() });
      batch.set(doc(db, "settings", "private"), { ...privateDoc, updatedAt: serverTimestamp() });
      try {
        await batch.commit();
      } catch (error) {
        throw mapSdkError(error);
      }
    },

    // Ajustes iniciales: setDoc solo si el documento no existe (lectura y escritura en la misma transacción).
    async seedInitialSettings() {
      const created: ("public" | "private")[] = [];
      try {
        await runTransaction(db, async (tx) => {
          created.length = 0;
          const pubRef = doc(db, "settings", "public");
          const privRef = doc(db, "settings", "private");
          const [pub, priv] = [await tx.get(pubRef), await tx.get(privRef)];
          if (!pub.exists()) {
            tx.set(pubRef, { ...buildInitialPublicSettings(), updatedAt: serverTimestamp() });
            created.push("public");
          }
          if (!priv.exists()) {
            tx.set(privRef, { ...buildInitialPrivateSettings(), updatedAt: serverTimestamp() });
            created.push("private");
          }
        });
      } catch (error) {
        throw mapSdkError(error);
      }
      return { created };
    },

    // Credenciales de Flow: callables solo-admin (D-035).
    getFlowCredentialsStatus: () => flowCredentials.getFlowCredentialsStatus(),
    setFlowCredentials: (input) => flowCredentials.setFlowCredentials(input),

    async seedInitialCategories() {
      const created: string[] = [];
      try {
        await runTransaction(db, async (tx) => {
          created.length = 0;
          const items = buildInitialCategories();
          const refs = items.map((c) => doc(db, "categories", c.id));
          const snaps: Awaited<ReturnType<typeof tx.get>>[] = [];
          for (const r of refs) snaps.push(await tx.get(r));
          items.forEach((c, i) => {
            if (snaps[i]!.exists()) return;
            // La regla de creación exige createdAt == request.time y updatedAt == request.time.
            tx.set(refs[i]!, { ...c.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            created.push(c.id);
          });
        });
      } catch (error) {
        throw mapSdkError(error);
      }
      return { created };
    },
  };
}

/** Servicio conectado al proyecto de Firebase configurado en las variables NEXT_PUBLIC_FIREBASE_*. */
export function createDefaultFirebaseAdminService(): AdminService {
  return createFirebaseAdminService({
    db: getFirebaseDb(),
    storage: getFirebaseStorage(),
    invoke: createFirebaseInvoker(),
    bucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  });
}
