// Servicio de pedidos para las pantallas. Hoy es el simulado (localStorage); en producción
// se cambia por las Cloud Functions detrás de la misma interfaz `OrderService`.
import { createMockOrderService, type MockOrderService, type MockSettings } from "./mock-service";
import type { CatalogEntry } from "./summary";

export * from "./types";
export { computeSummary, toCatalogEntry, effectiveThreshold, type CatalogEntry, type Summary, type SummaryLine, type DeliveryType } from "./summary";
export { validateCheckout, normalizePhone, type CheckoutFormValues, type FieldErrors, type FieldKey } from "./validation";
export type { MockOrderService, MockSettings } from "./mock-service";

/** Solo en el navegador. */
export function getOrderService(deps?: { catalog: Readonly<Record<string, CatalogEntry>>; settings: MockSettings }): MockOrderService {
  return createMockOrderService({ storage: window.localStorage, ...deps });
}
