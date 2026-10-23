// Servicio de pedidos para las pantallas. Con "demo" es el simulado (localStorage, D-028); con
// "firebase" son las Cloud Functions reales detrás de la misma interfaz `OrderService`.
import type { DataSource } from "@/lib/data-source";
import { createDefaultFirebaseOrderService } from "./firebase-service";
import { createMockOrderService, type MockOrderService, type MockSettings } from "./mock-service";
import type { CatalogEntry } from "./summary";
import type { OrderService } from "./types";

export * from "./types";
export { computeSummary, toCatalogEntry, effectiveThreshold, type CatalogEntry, type Summary, type SummaryLine, type DeliveryType } from "./summary";
export { validateCheckout, normalizePhone, type CheckoutFormValues, type FieldErrors, type FieldKey } from "./validation";
export type { MockOrderService, MockSettings } from "./mock-service";
export { browserStorage, recallOrderToken, rememberOrderToken } from "./order-access";
export { resolvePaymentsMode, type PaymentsMode } from "./payments-mode";

let firebaseService: OrderService | undefined;

/** Solo en el navegador. `deps` (catálogo y ajustes) solo los usa el simulado para calcular el pedido. */
export function getOrderService(
  source: DataSource,
  deps?: { catalog: Readonly<Record<string, CatalogEntry>>; settings: MockSettings },
): OrderService {
  if (source === "firebase") return (firebaseService ??= createDefaultFirebaseOrderService());
  return getMockOrderService(deps);
}

/** Solo demo: el simulado, con el "botón" de la pantalla de Flow simulada. */
export function getMockOrderService(deps?: { catalog: Readonly<Record<string, CatalogEntry>>; settings: MockSettings }): MockOrderService {
  return createMockOrderService({ storage: window.localStorage, ...deps });
}

/** La URL de Flow es externa: se navega fuera de la app. Las rutas internas (simulado) usan el router. */
export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
