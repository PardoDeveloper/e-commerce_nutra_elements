import { HttpsError, type FunctionsErrorCode } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import type { ZodError } from "zod";

// Catálogo de errores de aplicación (contrato functions.md, secciones 1, 3 y 4).
// Cada código de aplicación (`details.code`) se asocia a un código estándar de HttpsError y a un
// mensaje en español, apto para mostrar al usuario. Los mensajes son fijos: nunca interpolan datos
// del request (ni RUT, ni correo, ni teléfono) ni datos internos.
const ERROR_CATALOG = {
  // Comunes a todas las callables
  INVALID_INPUT: ["invalid-argument", "Revisa los datos del formulario."],
  UNAUTHENTICATED: ["unauthenticated", "Debes iniciar sesión."],
  NOT_ADMIN: ["permission-denied", "No tienes permisos para realizar esta acción."],
  APP_CHECK_FAILED: ["failed-precondition", "No se pudo verificar la aplicación. Recarga la página e intenta de nuevo."],
  RATE_LIMITED: ["resource-exhausted", "Demasiados intentos o pedidos sin pagar con este correo. Intenta de nuevo en unos minutos."],
  INTERNAL: ["internal", "Ocurrió un error inesperado. Intenta de nuevo."],
  // createOrder (3.1)
  INVALID_RUT: ["invalid-argument", "Revisa tu RUT."],
  INVALID_COMMUNE: ["invalid-argument", "Solo despachamos a comunas de la Región Metropolitana."],
  PICKUP_DISABLED: ["failed-precondition", "El retiro en tienda no está disponible."],
  PRODUCT_UNAVAILABLE: ["failed-precondition", "Un producto ya no está disponible."],
  OUT_OF_STOCK: ["failed-precondition", "No hay stock suficiente de un producto."],
  ZERO_TOTAL: ["failed-precondition", "No se puede procesar este pedido."],
  ORDER_TOO_LARGE: ["failed-precondition", "No se puede procesar este pedido."],
  CONTENTION: ["aborted", "El sistema está ocupado, intenta de nuevo."],
  // Pagos y pedidos (3.2 a 4.6)
  ORDER_NOT_FOUND: ["not-found", "No encontramos el pedido."],
  ORDER_NOT_PAYABLE: ["failed-precondition", "Este pedido no se puede pagar."],
  ORDER_EXPIRED: ["failed-precondition", "El pedido expiró. Crea uno nuevo."],
  FLOW_UNAVAILABLE: ["unavailable", "El medio de pago no está disponible. Intenta de nuevo."],
  INVALID_TRANSITION: ["failed-precondition", "El pedido no puede pasar a ese estado."],
  ORDER_NOT_TRANSFER: ["failed-precondition", "El pedido no es de transferencia."],
  ORDER_NOT_PAID: ["failed-precondition", "El pedido no está pagado."],
  REASON_REQUIRED: ["invalid-argument", "Indica el motivo del cambio."],
  INVALID_REFUND_AMOUNT: ["invalid-argument", "El monto del reembolso no es válido."],
  INVALID_REFUND_DATE: ["invalid-argument", "La fecha del reembolso no es válida."],
  // Credenciales de Flow (5.10)
  FLOW_SECRETS_LOCAL: ["failed-precondition", "En el entorno local las credenciales de Flow se configuran en functions/.secret.local."],
  FLOW_SECRET_MISSING: ["failed-precondition", "El secreto de Flow no existe en Secret Manager. Debe crearse antes de guardar credenciales."],
  FLOW_SECRET_FORBIDDEN: ["failed-precondition", "Las funciones no tienen permiso para usar los secretos de Flow en Secret Manager."],
} as const satisfies Record<string, readonly [FunctionsErrorCode, string]>;

export type AppErrorCode = keyof typeof ERROR_CATALOG;

/** Campo con error de validación. `message` nunca contiene el valor recibido. */
export interface FieldError {
  path: string;
  message: string;
}

/** Contenido de `HttpsError.details` (contrato functions.md, sección 1). */
export interface AppErrorDetails {
  code: AppErrorCode;
  sku?: string;
  available?: number;
  fields?: FieldError[];
}

export interface AppErrorExtra {
  sku?: string;
  available?: number;
  fields?: FieldError[];
}

/** Máximo de campos que se informan, para no devolver respuestas enormes. */
const MAX_FIELDS = 20;

/**
 * Crea el `HttpsError` del contrato para un código de aplicación.
 * Se usa con `throw appError("INVALID_RUT")`.
 */
export function appError(code: AppErrorCode, extra: AppErrorExtra = {}): HttpsError {
  const [httpsCode, message] = ERROR_CATALOG[code];
  const details: AppErrorDetails = { code };
  if (extra.sku !== undefined) details.sku = extra.sku;
  if (extra.available !== undefined) details.available = extra.available;
  if (extra.fields !== undefined) details.fields = extra.fields.slice(0, MAX_FIELDS);
  return new HttpsError(httpsCode, message, details);
}

/** Código de aplicación de un error, o `undefined` si no es un `HttpsError` de la aplicación. */
export function getAppErrorCode(err: unknown): AppErrorCode | undefined {
  if (!(err instanceof HttpsError)) return undefined;
  const details = err.details as { code?: unknown } | undefined;
  const code = details?.code;
  return typeof code === "string" && code in ERROR_CATALOG ? (code as AppErrorCode) : undefined;
}

/**
 * Convierte cualquier error en un `HttpsError` seguro para el cliente.
 * Los `HttpsError` pasan tal cual; los demás se registran solo con su nombre (sin mensaje, que
 * podría traer datos personales) y se devuelven como `INTERNAL` genérico.
 */
export function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  const errorName = err instanceof Error ? err.name : typeof err;
  logger.error("Error no previsto", { errorName });
  return appError("INTERNAL");
}

// Mensajes fijos por tipo de problema de zod. Se evita `issue.message` porque algunos mensajes de
// zod repiten el valor recibido o los nombres de claves desconocidas.
function genericMessage(issue: { code: string; message: string }): string {
  switch (issue.code) {
    case "custom":
      return issue.message; // Mensaje propio de nuestros esquemas; nunca interpola el valor.
    case "invalid_type":
      return "Campo obligatorio o de tipo no válido";
    case "too_small":
    case "too_big":
      return "Valor fuera de rango";
    case "invalid_format":
      return "Formato no válido";
    case "unrecognized_keys":
      return "Campo no permitido";
    case "invalid_value":
      return "Valor no permitido";
    default:
      return "Valor no válido";
  }
}

/** Lista `{path, message}` a partir de un error de zod, sin valores recibidos. */
export function fieldsFromZodError(error: ZodError): FieldError[] {
  return error.issues.slice(0, MAX_FIELDS).map((issue) => ({
    path: issue.path.map(String).join("."),
    message: genericMessage(issue),
  }));
}

/** `INVALID_INPUT` con `fields` a partir de un error de zod. */
export function invalidInputFromZod(error: ZodError): HttpsError {
  return appError("INVALID_INPUT", { fields: fieldsFromZodError(error) });
}
