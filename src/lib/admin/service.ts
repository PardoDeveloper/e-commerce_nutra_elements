// Interfaz del servicio del admin. Calcada de docs/team/contracts/functions.md (secciones 4 y 5):
// los nombres, los parámetros y los códigos de error son los de las Cloud Functions, para
// reemplazar la simulación (`demo-service.ts`) por `httpsCallable` sin tocar las pantallas.
// Los errores se lanzan como `AdminServiceError` (equivalente a HttpsError + details.code).
import type { RefundInput } from "./orders";
import type {
  AdminOrder,
  AdminProduct,
  AdminSettings,
  BatchOptions,
  BatchReport,
  AdminImage,
  CatalogRow,
  DailyMetric,
  DeleteReport,
  FlowCredentialsInput,
  FlowCredentialsStatus,
  FulfillmentStatus,
  PriceRow,
  ProductContentPatch,
  ProductDiscount,
  RestoreReport,
  StockRow,
  TopProduct,
} from "./types";

/** Agregados de `metrics/**` (data-model 2.6). Solo con Firebase; en la demo se calculan desde los pedidos. */
export interface AggregatedMetrics {
  days: DailyMetric[];
  top: TopProduct[];
}

export interface AdminState {
  products: readonly AdminProduct[];
  orders: readonly AdminOrder[];
  settings: AdminSettings;
  /** Solo Firebase: carga inicial de los datos. En la demo no existe (siempre listo). */
  status?: "loading" | "ready" | "error";
  /** Solo Firebase: mensaje cuando `status === "error"`. */
  loadError?: string;
  /** Solo Firebase: los documentos `settings/*` aún no existen y se muestran los valores iniciales del contrato. */
  settingsMissing?: boolean;
  /** Solo Firebase: `settings/private` aún no existe. */
  settingsPrivateMissing?: boolean;
  /** Solo Firebase: cuántas de las 6 categorías iniciales (D-023) ya existen; ausente = aún no se sabe. */
  initialCategoriesExisting?: number;
  /** Solo Firebase: métricas reales (si hay datos); null/ausente = calcular desde los pedidos. */
  metrics?: AggregatedMetrics | null;
}

export interface OrderActionResponse {
  order: AdminOrder;
  changed: boolean;
  message?: string;
}

export interface CommerceUpdateResponse {
  sku: string;
  price: number;
  finalPrice: number;
  stock: number;
  warnings: string[];
}

export interface AdminService {
  // --- Lecturas (en producción: Firestore con la regla de admin) ---
  getState(): AdminState;
  subscribe(listener: () => void): () => void;

  // --- Catálogo (functions.md 5) ---
  importCatalog(input: { rows: CatalogRow[] } & BatchOptions): Promise<BatchReport>;
  importPrices(input: { rows: PriceRow[] } & BatchOptions): Promise<BatchReport>;
  importStock(input: { rows: StockRow[] } & BatchOptions): Promise<BatchReport>;
  applyDiscount(input: { skus: string[]; discount: ProductDiscount | null } & BatchOptions): Promise<BatchReport>;
  setProductsPublished(input: { skus: string[]; published: boolean } & BatchOptions): Promise<BatchReport>;
  /** Eliminación lógica (D-029): `deletedAt`/`deletedBy` y `published=false`. Máximo 200 SKU. */
  deleteProducts(input: { skus: string[] }): Promise<DeleteReport>;
  /** Restaura productos eliminados; quedan despublicados. Máximo 200 SKU. */
  restoreProducts(input: { skus: string[] }): Promise<RestoreReport>;
  createProduct(input: { sku: string; name: string; price: number; stock: number; barcode?: string }): Promise<{ sku: string; created: boolean }>;
  updateProductCommerce(input: { sku: string; price?: number; stock?: number }): Promise<CommerceUpdateResponse>;
  /** Escritura directa del admin sobre campos de contenido (reglas de Firestore). */
  updateProductContent(sku: string, patch: ProductContentPatch): Promise<void>;
  /**
   * Solo Firebase: sube una imagen ya comprimida (WebP) a Storage (`products/{sku}/{id}.webp`) y devuelve
   * la imagen lista para guardar en `images`. Si no existe, la pantalla usa la demo.
   */
  uploadProductImage?(sku: string, blob: Blob): Promise<AdminImage>;
  /** Solo Firebase: cierra los listeners de Firestore (al salir). */
  dispose?(): void;
  /**
   * SOLO DEMO: desactivar/activar un producto. En el contrato `active` viene de la planilla
   * (ACTIVO); si Carlos quiere un interruptor manual, el tech-lead debe pedir una función nueva.
   */
  setProductActive(sku: string, active: boolean): Promise<void>;

  // --- Pedidos (functions.md 4) ---
  confirmTransferPayment(input: { orderNumber: string; reference?: string; note?: string }): Promise<OrderActionResponse>;
  cancelOrder(input: { orderNumber: string; reason: string }): Promise<OrderActionResponse>;
  updateFulfillment(input: { orderNumber: string; to: FulfillmentStatus; note?: string; reason?: string }): Promise<OrderActionResponse>;
  recordManualRefund(input: { orderNumber: string } & RefundInput): Promise<OrderActionResponse>;

  // --- Ajustes (settings/public y settings/private, escritura directa con validación en reglas) ---
  saveSettings(settings: AdminSettings): Promise<void>;
  /**
   * Solo Firebase: crea `settings/public` y `settings/private` con los valores iniciales, SOLO los que no existen
   * (transacción: nunca pisa nada). Devuelve cuáles creó.
   */
  seedInitialSettings?(): Promise<{ created: ("public" | "private")[] }>;
  /** Solo Firebase: crea las categorías iniciales (D-023) que no existen, en transacción. Devuelve los slugs creados. */
  seedInitialCategories?(): Promise<{ created: string[] }>;

  // --- Credenciales de Flow (functions.md 5.10, D-035): solo Firebase, solo admin, van a Secret Manager ---
  /** Si cada credencial existe y cuándo cambió. Nunca devuelve los valores. */
  getFlowCredentialsStatus?(): Promise<FlowCredentialsStatus>;
  /** Guarda una versión nueva de la apiKey y/o la secretKey. Devuelve el estado actualizado. */
  setFlowCredentials?(input: FlowCredentialsInput): Promise<FlowCredentialsStatus>;
}
