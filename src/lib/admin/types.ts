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
  family: string | null;
  seo: { title?: string; description?: string } | null;
  source: "controlfarma-xls" | "manual";
  /** Eliminación lógica (D-029): fecha ISO de la eliminación o null si el producto está vigente. */
  deletedAt: string | null;
  deletedBy: string | null;
}

/** Campos de contenido que el admin edita directo (data-model 2.1). */
export type ProductContentPatch = Partial<
  Pick<
    AdminProduct,
    "name" | "description" | "shortDescription" | "categoryId" | "images" | "slug" | "format" | "unitsPerPack" | "family" | "seo"
  >
>;

// ---------- Pedidos ----------
export type PaymentMethod = "flow" | "transfer";
export type PaymentStatus = "pending_payment" | "paid" | "payment_review" | "expired" | "cancelled" | "refunded";
export type FulfillmentStatus = "preparing" | "ready_for_pickup" | "on_route" | "delivered";
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
  transfer: { confirmedBy: string; confirmedAt: string; reference?: string; note?: string } | null;
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
  reservationMinutes: { flow: number; transfer: number };
  bank: {
    bankName: string;
    accountType: string;
    accountNumber: string;
    holderName: string;
    holderRut: string;
    contactEmail?: string;
  };
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
  field: "price" | "stock" | "discount" | "create";
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
  top: TopProduct[];
}
