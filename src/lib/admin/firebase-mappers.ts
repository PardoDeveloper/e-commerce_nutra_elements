// Conversión entre los documentos de Firestore y los tipos del admin (data-model.md 2.1, 2.3, 2.5, 2.6),
// más la validación y el armado de las escrituras directas permitidas por las reglas.
// Puro y sin el SDK de Firebase (los Timestamp se reconocen por `toDate()`), para probarlo en Node.
import type { CategoryId } from "@/lib/data/types";
import { AdminServiceError } from "./errors";
import type {
  AdminImage,
  AdminOrder,
  AdminProduct,
  AdminSettings,
  DailyMetric,
  OrderItem,
  PaymentMethod,
  PaymentStatus,
  ProductContentPatch,
  StatusHistoryEntry,
  TopProduct,
} from "./types";

export type Doc = Record<string, unknown>;

// ---------- Utilidades de lectura defensiva ----------

function isRecord(v: unknown): v is Doc {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);

/** Timestamp de Firestore (o Date) a ISO 8601. Un valor ausente o pendiente (serverTimestamp sin resolver) da null. */
export function toIso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (isRecord(v) && typeof (v as { toDate?: unknown }).toDate === "function") {
    const date = (v as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return v;
  return null;
}

/** URL pública de un archivo de Storage (las reglas permiten leer `products/**` a cualquiera). */
export function storageUrl(bucket: string, path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

// ---------- Productos ----------

function mapImages(v: unknown, bucket: string): AdminImage[] {
  if (!Array.isArray(v)) return [];
  const out: AdminImage[] = [];
  for (const item of v) {
    if (!isRecord(item) || typeof item.path !== "string") continue;
    out.push({
      path: item.path,
      alt: str(item.alt) ?? "",
      ...(bucket ? { previewUrl: storageUrl(bucket, item.path) } : {}),
    });
  }
  return out;
}

function mapDiscount(v: unknown): AdminProduct["discount"] {
  if (!isRecord(v)) return null;
  if ((v.type !== "percent" && v.type !== "fixed") || typeof v.value !== "number") return null;
  return { type: v.type, value: v.value };
}

function mapSeo(v: unknown): AdminProduct["seo"] {
  if (!isRecord(v)) return null;
  const seo: { title?: string; description?: string } = {};
  if (typeof v.title === "string") seo.title = v.title;
  if (typeof v.description === "string") seo.description = v.description;
  return seo;
}

export function mapProduct(sku: string, d: Doc, bucket: string): AdminProduct {
  const price = int(d.price);
  const stock = int(d.stock);
  return {
    sku,
    sourceName: str(d.sourceName) ?? str(d.name) ?? sku,
    name: str(d.name) ?? sku,
    slug: str(d.slug),
    description: str(d.description),
    shortDescription: str(d.shortDescription),
    categoryId: (str(d.categoryId) as CategoryId | null) ?? null,
    images: mapImages(d.images, bucket),
    price,
    discount: mapDiscount(d.discount),
    finalPrice: int(d.finalPrice, price),
    stock,
    reserved: int(d.reserved),
    inStock: bool(d.inStock, stock > 0),
    active: bool(d.active, true),
    published: bool(d.published),
    format: str(d.format),
    unitsPerPack: typeof d.unitsPerPack === "number" ? d.unitsPerPack : null,
    family: str(d.family),
    seo: mapSeo(d.seo),
    source: d.source === "controlfarma-xls" ? "controlfarma-xls" : "manual",
    deletedAt: toIso(d.deletedAt),
    deletedBy: str(d.deletedBy),
  };
}

// ---------- Pedidos ----------

const PAYMENT_STATUSES: readonly PaymentStatus[] = ["pending_payment", "paid", "payment_review", "expired", "cancelled", "refunded"];

function mapItems(v: unknown): OrderItem[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord).map((it) => ({
    sku: str(it.sku) ?? "",
    name: str(it.name) ?? "",
    unitPrice: int(it.unitPrice),
    discount: mapDiscount(it.discount),
    unitFinalPrice: int(it.unitFinalPrice),
    qty: int(it.qty),
    lineTotal: int(it.lineTotal),
  }));
}

function mapHistory(v: unknown): StatusHistoryEntry[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord).map((h) => {
    const entry: StatusHistoryEntry = {
      at: toIso(h.at) ?? "",
      kind: h.kind === "fulfillment" || h.kind === "stock" ? h.kind : "payment",
      from: str(h.from),
      to: str(h.to),
      by: str(h.by) ?? "system",
    };
    if (typeof h.note === "string") entry.note = h.note;
    if (typeof h.reason === "string") entry.reason = h.reason;
    if (h.direction === "backward") entry.direction = "backward";
    if (isRecord(h.refund)) {
      entry.refund = {
        amount: int(h.refund.amount),
        method: h.refund.method === "transfer" ? "transfer" : "flow",
        restock: bool(h.refund.restock),
      };
    }
    return entry;
  });
}

function mapDelivery(v: unknown): AdminOrder["delivery"] {
  if (isRecord(v) && v.type === "pickup") {
    return { type: "pickup", storeAddress: str(v.storeAddress) ?? "", storeHours: str(v.storeHours) ?? "" };
  }
  const d = isRecord(v) ? v : {};
  return {
    type: "shipping",
    communeCode: str(d.communeCode) ?? "",
    communeName: str(d.communeName) ?? "",
    address: str(d.address) ?? "",
    ...(typeof d.notes === "string" ? { notes: d.notes } : {}),
  };
}

export function mapOrder(id: string, d: Doc): AdminOrder {
  const customer = isRecord(d.customer) ? d.customer : {};
  const method: PaymentMethod = d.paymentMethod === "transfer" ? "transfer" : "flow";
  const paymentStatus = PAYMENT_STATUSES.find((s) => s === d.paymentStatus) ?? "pending_payment";
  const fulfillment = d.fulfillmentStatus;
  const transfer = isRecord(d.transfer) ? d.transfer : null;
  const refund = isRecord(d.refund) ? d.refund : null;
  return {
    orderNumber: str(d.orderNumber) ?? id,
    number: int(d.number),
    paymentMethod: method,
    paymentStatus,
    fulfillmentStatus:
      fulfillment === "preparing" || fulfillment === "ready_for_pickup" || fulfillment === "on_route" || fulfillment === "delivered" ? fulfillment : null,
    stockState: d.stockState === "committed" || d.stockState === "released" ? d.stockState : "reserved",
    customer: {
      firstName: str(customer.firstName) ?? "",
      lastName: str(customer.lastName) ?? "",
      email: str(customer.email) ?? "",
      phone: str(customer.phone) ?? "",
      rut: str(customer.rut) ?? "",
    },
    delivery: mapDelivery(d.delivery),
    items: mapItems(d.items),
    subtotal: int(d.subtotal),
    shipping: int(d.shipping),
    total: int(d.total),
    freeShippingApplied: bool(d.freeShippingApplied),
    transfer: transfer
      ? {
          confirmedBy: str(transfer.confirmedBy) ?? "",
          confirmedAt: toIso(transfer.confirmedAt) ?? "",
          ...(typeof transfer.reference === "string" ? { reference: transfer.reference } : {}),
          ...(typeof transfer.note === "string" ? { note: transfer.note } : {}),
        }
      : null,
    refund: refund
      ? {
          amount: int(refund.amount),
          method: refund.method === "transfer" ? "transfer" : "flow",
          refundedAt: toIso(refund.refundedAt) ?? "",
          note: str(refund.note) ?? "",
          restock: bool(refund.restock),
          restocked: bool(refund.restocked),
          recordedBy: str(refund.recordedBy) ?? "",
          recordedAt: toIso(refund.recordedAt) ?? "",
        }
      : null,
    statusHistory: mapHistory(d.statusHistory),
    paidAt: toIso(d.paidAt),
    createdAt: toIso(d.createdAt) ?? "",
    updatedAt: toIso(d.updatedAt) ?? "",
  };
}

// ---------- Métricas ----------

export function mapDailyMetric(d: Doc): DailyMetric | null {
  const date = str(d.date);
  if (!date) return null;
  return {
    date,
    ordersCount: int(d.ordersCount),
    revenue: int(d.revenue),
    merchandise: int(d.merchandise),
    unitsSold: int(d.unitsSold),
    // Los documentos anteriores a D-025 no traen estos campos: valor por defecto 0.
    refundsCount: int(d.refundsCount),
    refundedAmount: int(d.refundedAmount),
  };
}

export function mapTopProduct(sku: string, d: Doc): TopProduct {
  return { sku: str(d.sku) ?? sku, name: str(d.name) ?? sku, unitsSold: int(d.unitsSold), revenue: int(d.revenue) };
}

// ---------- Contenido de producto (escritura directa permitida por las reglas) ----------

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const CONTENT_KEYS = ["name", "description", "shortDescription", "categoryId", "images", "slug", "format", "unitsPerPack", "family", "seo"] as const;

/** Mismas validaciones que las reglas de Firestore, para dar un mensaje claro antes de escribir. */
export function validateContentPatch(current: AdminProduct, patch: ProductContentPatch): void {
  const bad = (code: string, message: string): never => {
    throw new AdminServiceError(code, message);
  };
  if (current.deletedAt) bad("PRODUCT_DELETED", "El producto está eliminado: restáuralo para editarlo.");
  if (patch.name !== undefined && (patch.name.trim() === "" || patch.name.length > 120)) bad("INVALID_NAME", "El nombre debe tener entre 1 y 120 caracteres.");
  if (patch.description != null && patch.description.length > 5000) bad("INVALID_INPUT", "La descripción admite hasta 5000 caracteres.");
  if (patch.shortDescription != null && patch.shortDescription.length > 300) bad("INVALID_INPUT", "La descripción corta admite hasta 300 caracteres.");
  if (patch.images) {
    if (patch.images.length > 8) bad("INVALID_INPUT", "Máximo 8 imágenes.");
    if (patch.images.some((i) => i.alt.length > 140)) bad("INVALID_INPUT", "El texto alternativo admite hasta 140 caracteres.");
  }
  if (patch.slug !== undefined) {
    if (current.published && patch.slug !== current.slug) bad("SLUG_LOCKED", "El slug no se puede cambiar mientras el producto está publicado.");
    if (patch.slug !== null && (!SLUG_PATTERN.test(patch.slug) || patch.slug.length > 80)) bad("INVALID_SLUG", "El slug solo admite minúsculas, números y guiones.");
  }
  if (patch.format != null && (patch.format.length < 1 || patch.format.length > 40)) bad("INVALID_INPUT", "El formato admite de 1 a 40 caracteres.");
  if (patch.unitsPerPack != null && (!Number.isInteger(patch.unitsPerPack) || patch.unitsPerPack < 1 || patch.unitsPerPack > 1000)) {
    bad("INVALID_INPUT", "Las unidades por envase deben ser un entero entre 1 y 1000.");
  }
  if (patch.family != null && (!SLUG_PATTERN.test(patch.family) || patch.family.length > 80)) bad("INVALID_INPUT", "La familia solo admite minúsculas, números y guiones.");
  if (patch.seo?.title && patch.seo.title.length > 70) bad("INVALID_INPUT", "El título SEO admite hasta 70 caracteres.");
  if (patch.seo?.description && patch.seo.description.length > 170) bad("INVALID_INPUT", "La descripción SEO admite hasta 170 caracteres.");
}

/**
 * Datos para `updateDoc`: SOLO los campos de contenido que las reglas permiten, sin `undefined`
 * (Firestore lo rechaza) y con las imágenes reducidas a `{path, alt}`. `updatedAt` lo agrega el servicio.
 */
export function buildContentUpdate(patch: ProductContentPatch): Doc {
  const out: Doc = {};
  for (const key of CONTENT_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (key === "images") {
      out.images = (value as AdminImage[]).map((i) => ({ path: i.path, alt: i.alt.trim() }));
    } else if (key === "seo") {
      const seo = value as ProductContentPatch["seo"];
      const clean: { title?: string; description?: string } = {};
      if (seo?.title) clean.title = seo.title;
      if (seo?.description) clean.description = seo.description;
      out.seo = seo && Object.keys(clean).length > 0 ? clean : null;
    } else {
      out[key] = value;
    }
  }
  return out;
}

// ---------- Ajustes ----------

export const DEFAULT_LIMITS = {
  createOrderPerIpPer10Min: 5,
  pendingOrdersPerEmail: 3,
  orderStatusPerIpPer10Min: 120, // D-032
  orderStatusFailuresPerOrder: 10,
} as const;

/** Valores iniciales del contrato (data-model 2.5) mientras los documentos no existen. */
export const DEFAULT_SETTINGS: AdminSettings = {
  shippingFee: 3990,
  freeShippingThreshold: null,
  pickup: { enabled: true, address: "Av. Concha y Toro 180, Puente Alto", hours: "Lunes a viernes de 9:00 a 20:00" },
  maxQtyPerItem: 10,
  reservationMinutes: { flow: 30, transfer: 2880 },
  bank: { bankName: "", accountType: "", accountNumber: "", holderName: "", holderRut: "" },
};

export function mergeSettings(pub: Doc | null, priv: Doc | null): AdminSettings {
  const base = DEFAULT_SETTINGS;
  const pickup = pub && isRecord(pub.pickup) ? pub.pickup : null;
  const minutes = priv && isRecord(priv.reservationMinutes) ? priv.reservationMinutes : null;
  const bank = priv && isRecord(priv.bank) ? priv.bank : null;
  const contactEmail = bank ? str(bank.contactEmail) : null;
  return {
    shippingFee: pub ? int(pub.shippingFee, base.shippingFee) : base.shippingFee,
    freeShippingThreshold: pub ? (typeof pub.freeShippingThreshold === "number" ? pub.freeShippingThreshold : null) : base.freeShippingThreshold,
    pickup: pickup
      ? { enabled: bool(pickup.enabled, true), address: str(pickup.address) ?? "", hours: str(pickup.hours) ?? "" }
      : { ...base.pickup },
    maxQtyPerItem: pub ? int(pub.maxQtyPerItem, base.maxQtyPerItem) : base.maxQtyPerItem,
    reservationMinutes: minutes
      ? { flow: int(minutes.flow, base.reservationMinutes.flow), transfer: int(minutes.transfer, base.reservationMinutes.transfer) }
      : { ...base.reservationMinutes },
    bank: bank
      ? {
          bankName: str(bank.bankName) ?? "",
          accountType: str(bank.accountType) ?? "",
          accountNumber: str(bank.accountNumber) ?? "",
          holderName: str(bank.holderName) ?? "",
          holderRut: str(bank.holderRut) ?? "",
          ...(contactEmail ? { contactEmail } : {}),
        }
      : { ...base.bank },
  };
}

export interface SettingsWrites {
  publicDoc: Doc;
  privateDoc: Doc;
}

/**
 * Documentos completos de `settings/public` y `settings/private` (las reglas exigen todas las claves y solo esas).
 * Conserva lo que el formulario no edita: `communes`, `orderNumberStart` y `limits`.
 * `updatedAt` lo agrega el servicio (`serverTimestamp()`).
 */
export function buildSettingsWrites(settings: AdminSettings, rawPublic: Doc | null, rawPrivate: Doc | null): SettingsWrites {
  if (!rawPublic || !Array.isArray(rawPublic.communes) || rawPublic.communes.length === 0) {
    throw new AdminServiceError(
      "SETTINGS_NOT_SEEDED",
      "Los ajustes públicos aún no existen en Firestore (falta el sembrado inicial con las comunas). Pídeselo al tech-lead.",
    );
  }
  const email = settings.bank.contactEmail?.trim();
  const bank: Doc = {
    bankName: settings.bank.bankName.trim(),
    accountType: settings.bank.accountType.trim(),
    accountNumber: settings.bank.accountNumber.trim(),
    holderName: settings.bank.holderName.trim(),
    holderRut: settings.bank.holderRut.trim(),
    ...(email ? { contactEmail: email } : {}),
  };
  const limits = rawPrivate && isRecord(rawPrivate.limits) ? { ...rawPrivate.limits } : { ...DEFAULT_LIMITS };
  return {
    publicDoc: {
      shippingFee: settings.shippingFee,
      freeShippingThreshold: settings.freeShippingThreshold,
      communes: rawPublic.communes,
      pickup: { enabled: settings.pickup.enabled, address: settings.pickup.address, hours: settings.pickup.hours },
      maxQtyPerItem: settings.maxQtyPerItem,
    },
    privateDoc: {
      reservationMinutes: { flow: settings.reservationMinutes.flow, transfer: settings.reservationMinutes.transfer },
      bank,
      orderNumberStart: rawPrivate ? int(rawPrivate.orderNumberStart, 1) : 1,
      limits,
    },
  };
}
