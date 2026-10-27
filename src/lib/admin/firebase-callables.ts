// Adaptadores de las Cloud Functions callable del admin (functions.md 4 y 5), AISLADOS en este archivo.
// Si firebase-architect cambia una firma (handoff 2b6), solo hay que ajustar este archivo.
//
// - Nombres, peticiones y respuestas: contrato v1.2.
// - Los errores (`HttpsError` con `details.code`) se convierten en `AdminServiceError` con mensajes en español.
// - `deleteProducts` / `restoreProducts` responden `BatchReport` en el contrato; aquí se adaptan a los
//   `DeleteReport` / `RestoreReport` que ya usa la interfaz.
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase/client";
import { AdminServiceError } from "./errors";
import type { RefundInput } from "./orders";
import type { CommerceUpdateResponse } from "./service";
import type {
  BatchOptions,
  BatchReport,
  CatalogRow,
  DeleteReport,
  FlowCredentialsInput,
  FlowCredentialsStatus,
  FlowCredentialStatus,
  FulfillmentStatus,
  InvalidRow,
  PriceRow,
  ProductDiscount,
  RestoreReport,
  StockRow,
} from "./types";

/** Invoca una callable y devuelve `data`. Los errores salen ya como `AdminServiceError`. */
export type CallableInvoker = (name: string, data: unknown) => Promise<unknown>;

// ---------- Errores ----------

/** Mensajes fijos en español por código de aplicación (`details.code`). Los demás usan el texto del servidor. */
const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Tu sesión expiró. Vuelve a iniciar sesión.",
  NOT_ADMIN: "Tu cuenta no tiene permisos de administrador.",
  APP_CHECK_FAILED: "La verificación de seguridad (App Check) falló. Recarga la página e inténtalo de nuevo.",
  RATE_LIMITED: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
  INTERNAL: "Ocurrió un error inesperado en el servidor. Inténtalo de nuevo.",
  ORDER_NOT_FOUND: "El pedido no existe.",
  ORDER_NOT_TRANSFER: "El pedido no se paga por transferencia.",
  ORDER_NOT_PAID: "Solo un pedido pagado tiene estado logístico.",
  REASON_REQUIRED: "Retroceder un estado exige un motivo (1 a 300 caracteres).",
  INVALID_REFUND_AMOUNT: "El monto del reembolso no es válido (entero entre 1 y el total del pedido).",
  INVALID_REFUND_DATE: "La fecha del reembolso no es válida (ni futura ni anterior al pago).",
  TOO_MANY_ROWS: "Hay demasiadas filas o productos en una sola operación. Divídela en partes más pequeñas.",
  EMPTY_BATCH: "No hay nada que procesar: elige al menos una fila o un producto.",
  SKU_NOT_FOUND: "El SKU no existe en el catálogo.",
  SKU_EXISTS: "Ya existe un producto con ese SKU.",
  PRODUCT_DELETED: "El producto está eliminado: restáuralo primero.",
  INVALID_PRICE: "El precio debe ser un entero entre 1 y 10.000.000.",
  INVALID_STOCK: "El stock debe ser un entero entre 0 y 1.000.000.",
  EMPTY_STOCK: "El stock no puede ir vacío.",
  FLOW_SECRETS_LOCAL: "En el entorno local las credenciales de Flow se configuran en functions/.secret.local.",
  FLOW_SECRET_MISSING: "El secreto de Flow no existe en Secret Manager. Pide que lo creen antes de guardar credenciales.",
  FLOW_SECRET_FORBIDDEN: "Las funciones no tienen permiso para usar los secretos de Flow en Secret Manager.",
};

export const FUNCTION_UNAVAILABLE_MESSAGE = "Función no disponible todavía.";
const NETWORK_MESSAGE = "No se pudo contactar al servidor. Revisa tu conexión e inténtalo de nuevo.";

interface RawFunctionsError {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

function detailsOf(error: RawFunctionsError): { code: string | null; fields: string[] } {
  const d = error.details;
  if (typeof d !== "object" || d === null) return { code: null, fields: [] };
  const code = typeof (d as { code?: unknown }).code === "string" ? (d as { code: string }).code : null;
  const rawFields = (d as { fields?: unknown }).fields;
  const fields = Array.isArray(rawFields)
    ? rawFields.flatMap((f) => (typeof f === "object" && f !== null && typeof (f as { path?: unknown }).path === "string" ? [(f as { path: string }).path] : []))
    : [];
  return { code, fields };
}

/** Convierte el error de `httpsCallable` (FunctionsError / HttpsError) en un `AdminServiceError`. */
export function mapCallableError(error: unknown): AdminServiceError {
  if (error instanceof AdminServiceError) return error;
  const e: RawFunctionsError = typeof error === "object" && error !== null ? error : {};
  const fcode = typeof e.code === "string" ? e.code.replace(/^functions\//, "") : "";
  const { code: appCode, fields } = detailsOf(e);
  const serverMessage = typeof e.message === "string" ? e.message.trim() : "";

  if (appCode) {
    // Con código de aplicación el servidor manda un mensaje en español apto para mostrar.
    const fixed = MESSAGES[appCode];
    let message = fixed ?? (serverMessage || MESSAGES.INTERNAL!);
    if (appCode === "INVALID_INPUT") message = `${serverMessage || "Revisa los datos enviados."}${fields.length ? ` Campos: ${fields.join(", ")}.` : ""}`;
    return new AdminServiceError(appCode, message);
  }
  switch (fcode) {
    case "not-found":
      // Sin código de aplicación: la función no está desplegada (el servidor respondió 404).
      return new AdminServiceError("FUNCTION_UNAVAILABLE", FUNCTION_UNAVAILABLE_MESSAGE);
    case "unauthenticated":
      return new AdminServiceError("UNAUTHENTICATED", MESSAGES.UNAUTHENTICATED!);
    case "permission-denied":
      return new AdminServiceError("NOT_ADMIN", MESSAGES.NOT_ADMIN!);
    case "unavailable":
    case "deadline-exceeded":
      return new AdminServiceError("NETWORK", NETWORK_MESSAGE);
    default:
      return new AdminServiceError("INTERNAL", MESSAGES.INTERNAL!);
  }
}

// ---------- Invocador real ----------

/** Timeouts del cliente por función (ms): un poco por encima del timeout de la función. */
const TIMEOUTS: Record<string, number> = {
  importCatalog: 130_000,
  importPrices: 70_000,
  importStock: 70_000,
  applyDiscount: 70_000,
  setProductsPublished: 70_000,
  deleteProducts: 70_000,
  restoreProducts: 70_000,
};

export function createFirebaseInvoker(): CallableInvoker {
  return async (name, data) => {
    try {
      const callable = httpsCallable(getFirebaseFunctions(), name, { timeout: TIMEOUTS[name] ?? 40_000 });
      const result = await callable(data);
      return result.data;
    } catch (error) {
      throw mapCallableError(error);
    }
  };
}

// ---------- Respuestas ----------

function unexpected(): never {
  throw new AdminServiceError("INTERNAL", "El servidor respondió algo inesperado. Inténtalo de nuevo.");
}

function record(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return unexpected();
  return v as Record<string, unknown>;
}
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** `BatchReport` del contrato (sin `changes`: es extra de la vista previa y lo agrega el servicio). */
export function parseBatchReport(raw: unknown): BatchReport {
  const r = record(raw);
  return {
    importId: typeof r.importId === "string" ? r.importId : null,
    dryRun: r.dryRun === true,
    rows: num(r.rows),
    created: num(r.created),
    updated: num(r.updated),
    unchanged: num(r.unchanged),
    skipped: num(r.skipped),
    corrected: list(r.corrected),
    invalid: list(r.invalid),
    warnings: list(r.warnings),
    truncated: r.truncated === true,
    changes: [],
  };
}

/** SKU que el servidor aceptó: los enviados menos los que salen como filas inválidas (`row` = posición 1-based). */
function acceptedSkus(skus: readonly string[], invalid: readonly InvalidRow[]): string[] {
  const rejected = new Set(invalid.map((i) => i.row));
  return skus.filter((_, index) => !rejected.has(index + 1));
}

export function toDeleteReport(skus: readonly string[], report: BatchReport): DeleteReport {
  return { rows: report.rows || skus.length, deleted: report.updated, deletedSkus: acceptedSkus(skus, report.invalid), invalid: report.invalid, skipped: report.invalid.length };
}

export function toRestoreReport(skus: readonly string[], report: BatchReport): RestoreReport {
  return { rows: report.rows || skus.length, restored: report.updated, restoredSkus: acceptedSkus(skus, report.invalid), invalid: report.invalid, skipped: report.invalid.length };
}

// ---------- Callables del catálogo (functions.md 5) ----------

/** Solo viajan los campos que el contrato define (los esquemas del servidor son `strict`). */
function options(opts: BatchOptions): { dryRun?: boolean; fileName?: string } {
  return {
    ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
    ...(opts.fileName ? { fileName: opts.fileName } : {}),
  };
}

export function createCatalogCallables(invoke: CallableInvoker) {
  const batch = async (name: string, data: unknown) => parseBatchReport(await invoke(name, data));
  return {
    importCatalog: (input: { rows: CatalogRow[] } & BatchOptions) => batch("importCatalog", { rows: input.rows, ...options(input) }),
    importPrices: (input: { rows: PriceRow[] } & BatchOptions) => batch("importPrices", { rows: input.rows, ...options(input) }),
    importStock: (input: { rows: StockRow[] } & BatchOptions) => batch("importStock", { rows: input.rows, ...options(input) }),
    applyDiscount: (input: { skus: string[]; discount: ProductDiscount | null } & BatchOptions) =>
      batch("applyDiscount", { skus: input.skus, discount: input.discount, ...options(input) }),
    setProductsPublished: (input: { skus: string[]; published: boolean } & BatchOptions) =>
      batch("setProductsPublished", { skus: input.skus, published: input.published, ...options(input) }),
    async deleteProducts(input: { skus: string[] }): Promise<DeleteReport> {
      return toDeleteReport(input.skus, await batch("deleteProducts", { skus: input.skus }));
    },
    async restoreProducts(input: { skus: string[] }): Promise<RestoreReport> {
      return toRestoreReport(input.skus, await batch("restoreProducts", { skus: input.skus }));
    },
    async createProduct(input: { sku: string; name: string; price: number; stock: number; barcode?: string }) {
      const r = record(
        await invoke("createProduct", {
          sku: input.sku,
          name: input.name.trim(),
          price: input.price,
          stock: input.stock,
          ...(input.barcode?.trim() ? { barcode: input.barcode.trim() } : {}),
        }),
      );
      return { sku: typeof r.sku === "string" ? r.sku : input.sku, created: r.created !== false };
    },
    async updateProductCommerce(input: { sku: string; price?: number; stock?: number; commissionPerUnit?: number | null }): Promise<CommerceUpdateResponse> {
      const r = record(
        await invoke("updateProductCommerce", {
          sku: input.sku,
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(input.stock !== undefined ? { stock: input.stock } : {}),
          ...(input.commissionPerUnit !== undefined ? { commissionPerUnit: input.commissionPerUnit } : {}),
        }),
      );
      return {
        sku: typeof r.sku === "string" ? r.sku : input.sku,
        price: num(r.price),
        finalPrice: num(r.finalPrice),
        stock: num(r.stock),
        commissionPerUnit: typeof r.commissionPerUnit === "number" ? r.commissionPerUnit : null,
        warnings: list<string>(r.warnings).filter((w) => typeof w === "string"),
      };
    },
  };
}

// ---------- Callables de pedidos (functions.md 4) ----------

export interface OrderCallResult {
  /** ¿La llamada cambió algo? (las repetidas son idempotentes y responden `false`). */
  changed: boolean;
  message?: string;
}

export function createOrderCallables(invoke: CallableInvoker) {
  return {
    async confirmTransferPayment(input: { orderNumber: string; reference?: string; note?: string }): Promise<OrderCallResult> {
      const r = record(
        await invoke("confirmTransferPayment", {
          orderNumber: input.orderNumber,
          ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        }),
      );
      return {
        changed: r.alreadyPaid !== true,
        ...(r.paymentStatus === "payment_review"
          ? { message: "El pedido pasó a revisión de pago: la reserva había expirado y ya no hay stock. El dinero sí se recibió." }
          : {}),
      };
    },
    async cancelOrder(input: { orderNumber: string; reason: string }): Promise<OrderCallResult> {
      await invoke("cancelOrder", { orderNumber: input.orderNumber, reason: input.reason.trim() });
      return { changed: true };
    },
    async updateFulfillment(input: { orderNumber: string; to: FulfillmentStatus; note?: string; reason?: string }): Promise<OrderCallResult> {
      const r = record(
        await invoke("updateFulfillment", {
          orderNumber: input.orderNumber,
          to: input.to,
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
          ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        }),
      );
      return { changed: r.changed !== false };
    },
    async recordManualRefund(input: { orderNumber: string } & RefundInput): Promise<OrderCallResult> {
      const r = record(
        await invoke("recordManualRefund", {
          orderNumber: input.orderNumber,
          amount: input.amount,
          method: input.method,
          refundedAt: input.refundedAt,
          note: input.note.trim(),
          restock: input.restock,
        }),
      );
      return { changed: r.alreadyRefunded !== true };
    },
  };
}

// ---------- Credenciales de Flow (functions.md 5.10, D-035) ----------

const credentialStatus = (v: unknown): FlowCredentialStatus => {
  const r = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  return { configured: r.configured === true, updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null };
};

export function parseFlowCredentialsStatus(raw: unknown): FlowCredentialsStatus {
  const r = record(raw);
  const apiKey = typeof r.apiKey === "object" && r.apiKey !== null ? (r.apiKey as Record<string, unknown>) : {};
  return {
    apiKey: { ...credentialStatus(r.apiKey), hint: typeof apiKey.hint === "string" ? apiKey.hint : null },
    secretKey: credentialStatus(r.secretKey),
  };
}

export function createFlowCredentialsCallables(invoke: CallableInvoker) {
  return {
    async getFlowCredentialsStatus(): Promise<FlowCredentialsStatus> {
      return parseFlowCredentialsStatus(await invoke("getFlowCredentialsStatus", {}));
    },
    /** Solo viajan los campos con valor: un campo vacío deja la credencial como está. */
    async setFlowCredentials(input: FlowCredentialsInput): Promise<FlowCredentialsStatus> {
      const apiKey = input.apiKey?.trim();
      const secretKey = input.secretKey?.trim();
      return parseFlowCredentialsStatus(
        await invoke("setFlowCredentials", { ...(apiKey ? { apiKey } : {}), ...(secretKey ? { secretKey } : {}) }),
      );
    },
  };
}
