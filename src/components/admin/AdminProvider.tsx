"use client";

// Proveedor del admin. Con `dataSource = "demo"` (D-028) recibe del servidor el catálogo público y lo convierte en
// datos de demostración (stock y pedidos ficticios y deterministas). Con `"firebase"` (D-031) usa el servicio real
// (Firestore, Storage y Functions) y no necesita semilla. El servicio es una instancia única por pestaña: sobrevive
// a la navegación; con Firebase se descarta al cerrar la sesión.
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { Product, PublicSettings } from "@/lib/data/types";
import { createDemoService } from "@/lib/admin/demo-service";
import { createDefaultFirebaseAdminService } from "@/lib/admin/firebase-service";
import { setActiveDataSource, type DataSource } from "@/lib/admin/mode";
import { createPersistenceClient, withProductPersistence, type PersistenceClient } from "@/lib/admin/demo-persistence";
import type { AdminProduct } from "@/lib/admin/types";
import { defaultSettings, generateOrders, toAdminProduct } from "@/lib/admin/seed";
import { dayKey } from "@/lib/admin/metrics";
import type { AdminService, AdminState } from "@/lib/admin/service";

export interface AdminSeed {
  products: Product[];
  settings: Pick<PublicSettings, "shippingFee" | "freeShippingThreshold" | "pickup" | "maxQtyPerItem">;
  communes: PublicSettings["communes"];
  /**
   * Persistencia local de productos (D-030). Si existe, el estado inicial de productos viene del
   * servidor (catálogo base + cambios guardados) y las operaciones de productos se guardan allá.
   * `products` sigue siendo el catálogo base: de él salen los pedidos de demostración.
   */
  persistence?: { products: AdminProduct[] };
}

interface AdminContextValue {
  dataSource: DataSource;
  /** Solo en demo. Con Firebase es null. */
  seed: AdminSeed | null;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ dataSource, seed, children }: { dataSource: DataSource; seed: AdminSeed | null; children: ReactNode }) {
  // Los textos de los avisos dependen de la fuente de datos; se fija antes de renderizar a los hijos.
  setActiveDataSource(dataSource);
  return <AdminContext.Provider value={{ dataSource, seed }}>{children}</AdminContext.Provider>;
}

/** Fuente de datos del admin ("demo" o "firebase"), decidida por el servidor con DATA_SOURCE. */
export function useDataSource(): DataSource {
  return useContext(AdminContext)?.dataSource ?? "demo";
}

let singleton: AdminService | null = null;
let persistenceClient: PersistenceClient | null = null;
/** Instante de referencia de los datos de demostración (se fija una vez por pestaña). */
let anchorMs = 0;

/** Descarta el servicio (cierra los listeners de Firestore). Se llama al cerrar la sesión. */
export function resetAdminService(): void {
  singleton?.dispose?.();
  singleton = null;
}

/** Crea el servicio la primera vez (solo en el navegador, después de iniciar sesión). */
function getService(value: AdminContextValue): AdminService {
  if (singleton) return singleton;
  if (value.dataSource === "firebase") {
    anchorMs = Date.now();
    singleton = createDefaultFirebaseAdminService();
    return singleton;
  }
  const seed = value.seed;
  if (!seed) throw new Error("El modo demostración necesita la semilla de datos del servidor.");
  const baseProducts = seed.products.map(toAdminProduct);
  const products = seed.persistence ? seed.persistence.products : baseProducts;
  const settings = defaultSettings(seed.settings);
  // `now` se fija una sola vez: los datos no cambian entre renders.
  anchorMs = Date.now();
  // Los pedidos salen siempre del catálogo base: editar productos no cambia el historial de demostración.
  const orders = generateOrders({ products: baseProducts, communes: seed.communes, settings, now: new Date(anchorMs) });
  const service = createDemoService({ products, orders, settings });
  if (seed.persistence) {
    persistenceClient = createPersistenceClient();
    singleton = withProductPersistence(service, persistenceClient, new Set(baseProducts.map((p) => p.sku)));
  } else {
    singleton = service;
  }
  return singleton;
}

export function useAdminService(): AdminService {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdminService debe usarse dentro de <AdminProvider>.");
  return getService(value);
}

/** ¿Está activa la persistencia local de productos? (D-030). No crea el servicio: sirve para el banner. */
export function useIsPersistent(): boolean {
  return useContext(AdminContext)?.seed?.persistence != null;
}

/** Cliente de la persistencia local (D-030), o null si el admin trabaja solo en memoria. */
export function useDemoPersistence(): PersistenceClient | null {
  const service = useAdminService();
  void service; // asegura que el servicio (y el cliente) ya se crearon
  return persistenceClient;
}

/** Estado vivo del servicio (se vuelve a renderizar al cambiar productos, pedidos o ajustes). */
export function useAdminState(): AdminState {
  const service = useAdminService();
  return useSyncExternalStore(service.subscribe, service.getState, service.getState);
}

/** Fecha de hoy (`YYYY-MM-DD`, America/Santiago) fijada al crear los datos de demostración. */
export function useAdminToday(): string {
  useAdminService();
  return dayKey(anchorMs);
}
