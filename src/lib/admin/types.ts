// Tipos del admin. Calcados de docs/team/contracts/data-model.md (2.1, 2.3, 2.5, 2.6) y
// functions.md (4 y 5), para cambiar la simulación por las Cloud Functions sin tocar pantallas.
import type { CategoryId } from "@/lib/data/types";

export type Sku = string;
export type Clp = number;

export interface ProductDiscount {
  type: "percent" | "fixed";
  value: number;
}

export interface AdminImage {
  /** Ruta en Storage `products/{sku}/{id}.webp`. En la demo no se sube nada. */
  path: string;
  alt: string;
  /** Solo demo: vista previa local (object URL / data URL). No existe en el contrato. */
  previewUrl?: string;
  /** Peso en bytes tras la compresión (informativo). */
  bytes?: number;
}

export interface AdminProduct {
  sku: Sku;
  sourceName: string;
  name: string;
  slug: string | null;
  description: string | null;
  shortDescription: string | null;
  categoryId: CategoryId | null;
  images: AdminImage[];
  price: Clp;
  discount: ProductDiscount | null;
  finalPrice: Clp;
  /** Unidades disponibles para vender (ya descontadas las reservadas). */
  stock: number;
  reserved: number;
  inStock: boolean;
  active: boolean;
  published: boolean;
  format: string | null;
  unitsPerPack: number | null;
  /** Se muestra en «Productos destacados» del inicio. Lo edita el admin (contenido). */
  featured: boolean;
  seo: { title?: string; description?: string } | null;
  source: "controlfarma-xls" | "manual";
  /** Comisión del químico en CLP por unidad vendida, o null si aún no se define. La escribe el servidor. */
  commissionPerUnit: number | null;
  /** Eliminación lógica (D-029): fecha ISO de la eliminación o null si el producto está vigente. */
  deletedAt: string | null;
  deletedBy: string | null;
}

/** Campos de contenido que el admin edita directo (data-model 2.1). */
export type ProductContentPatch = Partial<
  Pick<
    AdminProduct,
    "name" | "description" | "shortDescription" | "categoryId" | "images" | "slug" | "format" | "unitsPerPack" | "featured" | "seo"
  >
>;

// ---------- Categorías (data-model 2.2) ----------
/** Categoría del catálogo. El slug es el ID del documento: se genera del nombre al crearla y no cambia. */
export interface AdminCategory {
  slug: CategoryId;
  name: string;
  order: number;
  published: boolean;
}

// ---------- Pedidos ----------
/** Solo Flow (D-044). */
export type PaymentMethod = "flow";
export type PaymentStatus = "pending_payment" | "paid" | "payment_review" | "expired" | "cancelled" | "refunded";
export type FulfillmentStatus = "preparing" | "ready_for_pickup" | "on_route" | "delivered";
/** Cómo se devolvió el dinero fuera del sistema: por Flow o por transferencia al cliente. */
export type RefundMethod = "flow" | "transfer";
export type StockState = "reserved" | "committed" | "released";

export interface OrderItem {
  sku: Sku;
  name: string;
  unitPrice: Clp;
  discount: ProductDiscount | null;
  unitFinalPrice: Clp;
  qty: number;
  lineTotal: Clp;
  /** Comisión congelada al crear el pedido (CLP por unidad y total de la línea). Pedidos antiguos: null y 0. */
  commissionPerUnit: number | null;
  commission: Clp;
}

export interface StatusHistoryEntry {
  at: string;
  kind: "payment" | "fulfillment" | "stock";
  from: string | null;
  to: string | null;
  by: string;
  note?: string;
  reason?: string;
  direction?: "backward";
  refund?: { amount: Clp; method: RefundMethod; restock: boolean };
}

export interface OrderRefund {
  amount: Clp;
  method: RefundMethod;
  refundedAt: string;
  note: string;
  restock: boolean;
  restocked: boolean;
  recordedBy: string;
  recordedAt: string;
}

export type OrderDelivery =
  | { type: "shipping"; communeCode: string; communeName: string; address: string; notes?: string }
  | { type: "pickup"; storeAddress: string; storeHours: string };

export interface AdminOrder {
  orderNumber: string;
  number: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus | null;
  stockState: StockState;
  customer: { firstName: string; lastName: string; email: string; phone: string; rut: string };
  delivery: OrderDelivery;
  items: OrderItem[];
  subtotal: Clp;
  shipping: Clp;
  total: Clp;
  freeShippingApplied: boolean;
  refund: OrderRefund | null;
  statusHistory: StatusHistoryEntry[];
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- Ajustes ----------
export interface AdminSettings {
  /** settings/public */
  shippingFee: Clp;
  freeShippingThreshold: Clp | null;
  pickup: { enabled: boolean; address: string; hours: string };
  maxQtyPerItem: number;
  /** settings/private */
  reservationMinutes: { flow: number };
}

// ---------- Lotes (functions.md 5) ----------
export type Cell = string | number | null;
export interface InvalidRow {
  row: number;
  sku?: string;
  code: string;
  message: string;
}
export interface CorrectedCell {
  row: number;
  sku: string;
  field: string;
  from: Cell;
  to: Cell;
}
export interface Warning {
  sku?: string;
  code: string;
  message: string;
}
export interface BatchOptions {
  dryRun?: boolean;
  fileName?: string;
}
/** Cambio previsto para una fila válida (antes -> después). Extensión de la vista previa. */
export interface PlannedChange {
  row: number;
  sku: string;
  name: string;
  field: "price" | "stock" | "discount" | "create" | "description";
  from: Cell;
  to: Cell;
}
export interface BatchReport {
  importId: string | null;
  dryRun: boolean;
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  corrected: CorrectedCell[];
  invalid: InvalidRow[];
  warnings: Warning[];
  truncated: boolean;
  /** Solo demo: detalle de los cambios para la vista previa. */
  changes: PlannedChange[];
}

export interface CatalogRow {
  ID: Cell;
  NOMBRE: Cell;
  CODIGO_BARRA: Cell;
  STOCK_ACTUAL: Cell;
  PRECIO_VENTA_PUBLICO: Cell;
  ACTIVO: Cell;
  LABORATORIO: Cell;
  DESCRIPCION?: Cell;
}
export interface PriceRow {
  SKU: Cell;
  PRECIO: Cell;
}
export interface StockRow {
  SKU: Cell;
  STOCK: Cell;
}

/** Resultado de `deleteProducts` / `restoreProducts` (D-029). Mismo estilo que los otros lotes. */
export interface DeleteReport {
  rows: number;
  /** Productos que pasaron a eliminados. */
  deleted: number;
  /** SKU efectivamente eliminados, para mostrarlos en el aviso. */
  deletedSkus: string[];
  invalid: InvalidRow[];
  skipped: number;
}
export interface RestoreReport {
  rows: number;
  /** Productos que volvieron (despublicados). */
  restored: number;
  restoredSkus: string[];
  invalid: InvalidRow[];
  skipped: number;
}

// ---------- Métricas ----------
export interface DailyMetric {
  date: string;
  ordersCount: number;
  revenue: Clp;
  merchandise: Clp;
  unitsSold: number;
  refundsCount: number;
  refundedAmount: Clp;
  /** Comisiones devengadas el día (pagos) menos las revertidas por reembolsos. */
  commission: Clp;
}
export interface TopProduct {
  sku: Sku;
  name: string;
  unitsSold: number;
  revenue: Clp;
}
export interface MetricsSummary {
  days: DailyMetric[];
  /** Σ revenue (neto de reembolsos). */
  sales: Clp;
  orders: number;
  /** Neto / pedidos (0 si no hay pedidos). */
  averageTicket: Clp;
  refundsCount: number;
  refundedAmount: Clp;
  commission: Clp;
  top: TopProduct[];
}

/** Estado de una credencial de Flow en Secret Manager (D-035). Nunca incluye el valor. */
export interface FlowCredentialStatus {
  configured: boolean;
  /** Fecha ISO de la última versión, o null. */
  updatedAt: string | null;
}

export interface FlowCredentialsStatus {
  /** `hint`: últimos 4 caracteres de la apiKey, para reconocerla. */
  apiKey: FlowCredentialStatus & { hint: string | null };
  secretKey: FlowCredentialStatus;
}

/** Entrada de `setFlowCredentials`: un campo vacío o ausente no cambia esa credencial. */
export interface FlowCredentialsInput {
  apiKey?: string;
  secretKey?: string;
}
