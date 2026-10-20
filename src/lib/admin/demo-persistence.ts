// Cliente de la persistencia local del prototipo (D-030). Se ejecuta en el navegador.
// Envuelve el servicio simulado: tras cada operación de PRODUCTOS que cambie algo, envía al servidor
// los productos modificados (el servidor valida todo otra vez). Pedidos, métricas y ajustes siguen
// en memoria. >>> Con Firebase desaparece: las Cloud Functions y Firestore ya persisten. <<<
import { toStoredInput } from "@/lib/demo-store/merge";
import { WRITE_HEADER } from "@/lib/demo-store/config";
import type { StoredProductInput } from "@/lib/demo-store/types";
import { AdminServiceError } from "./errors";
import type { AdminService } from "./service";
import type { AdminProduct } from "./types";

export interface PersistenceClient {
  saveProducts(products: StoredProductInput[]): Promise<void>;
  uploadImage(sku: string, blob: Blob): Promise<{ path: string; url: string }>;
  reset(): Promise<void>;
}

async function failure(response: Response, fallback: string): Promise<AdminServiceError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string; details?: string[] } };
    const details = body.error?.details?.length ? ` ${body.error.details.slice(0, 3).join(" ")}` : "";
    return new AdminServiceError(body.error?.code ?? "PERSIST_FAILED", `${body.error?.message ?? fallback}${details}`);
  } catch {
    return new AdminServiceError("PERSIST_FAILED", fallback);
  }
}

export function createPersistenceClient(fetchImpl: typeof fetch = (...args) => fetch(...args)): PersistenceClient {
  const headers = { [WRITE_HEADER]: "1" };
  return {
    async saveProducts(products) {
      // En lotes de 400 para no enviar cuerpos enormes.
      for (let i = 0; i < products.length; i += 400) {
        const response = await fetchImpl("/api/demo-admin/products", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ products: products.slice(i, i + 400) }),
        });
        if (!response.ok) throw await failure(response, "El servidor no pudo guardar los cambios.");
      }
    },
    async uploadImage(sku, blob) {
      const form = new FormData();
      form.set("sku", sku);
      form.set("file", new File([blob], "imagen", { type: blob.type }));
      const response = await fetchImpl("/api/demo-admin/images", { method: "POST", headers, body: form });
      if (!response.ok) throw await failure(response, "El servidor no pudo guardar la imagen.");
      const body = (await response.json()) as { path: string; url: string };
      return { path: body.path, url: body.url };
    },
    async reset() {
      const response = await fetchImpl("/api/demo-admin/reset", { method: "POST", headers });
      if (!response.ok) throw await failure(response, "No se pudo restablecer el catálogo.");
    },
  };
}

/**
 * Devuelve un servicio que persiste los cambios de productos. `persistable` son los SKU del catálogo
 * base (el servidor rechaza los demás: los productos creados a mano quedan solo en memoria).
 */
export function withProductPersistence(service: AdminService, client: PersistenceClient, persistable: ReadonlySet<string>): AdminService {
  const snapshot = (): Map<string, string> => new Map(service.getState().products.filter((p) => persistable.has(p.sku)).map((p) => [p.sku, JSON.stringify(toStoredInput(p))] as const));

  async function tracked<T>(run: () => Promise<T>): Promise<T> {
    const before = snapshot();
    const result = await run();
    const changed: AdminProduct[] = service.getState().products.filter((p) => persistable.has(p.sku) && before.get(p.sku) !== JSON.stringify(toStoredInput(p)));
    if (changed.length > 0) {
      try {
        await client.saveProducts(changed.map(toStoredInput));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido.";
        throw new AdminServiceError("PERSIST_FAILED", `No se pudo guardar en el servidor: ${message} Recarga la página para volver a lo guardado.`);
      }
    }
    return result;
  }

  return {
    ...service,
    importCatalog: (input) => tracked(() => service.importCatalog(input)),
    importPrices: (input) => tracked(() => service.importPrices(input)),
    importStock: (input) => tracked(() => service.importStock(input)),
    applyDiscount: (input) => tracked(() => service.applyDiscount(input)),
    setProductsPublished: (input) => tracked(() => service.setProductsPublished(input)),
    deleteProducts: (input) => tracked(() => service.deleteProducts(input)),
    restoreProducts: (input) => tracked(() => service.restoreProducts(input)),
    createProduct: (input) => tracked(() => service.createProduct(input)),
    updateProductCommerce: (input) => tracked(() => service.updateProductCommerce(input)),
    updateProductContent: (sku, patch) => tracked(() => service.updateProductContent(sku, patch)),
    setProductActive: (sku, active) => tracked(() => service.setProductActive(sku, active)),
  };
}
