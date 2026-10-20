import { z } from "zod";
import { appError, invalidInputFromZod } from "./errors.js";
import { normalizeRut } from "./rut.js";

// Esquemas de entrada de los callables públicos. Por ahora solo `createOrder` (functions.md 3.1);
// la función se implementa en la 2B.4. Reglas comunes (functions.md, sección 1): cadenas con
// `trim`, sin caracteres de control, con largo máximo; números enteros seguros; campos
// desconocidos rechazados (`strictObject`), así `price`, `total`, `shipping` o `discount` en el
// request dan `INVALID_INPUT` (D-005).
// Los mensajes de `refine` son fijos y nunca incluyen el valor recibido.

// Caracteres de control C0, DEL y C1.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

/** Texto recortado, con largo en caracteres y sin caracteres de control. */
function text(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !CONTROL_CHARS.test(v), { message: "Contiene caracteres no permitidos" });
}

const SKU_REGEX = /^[A-Za-z0-9_-]{1,32}$/;
const COMMUNE_CODE_REGEX = /^[a-z0-9-]{1,60}$/;

/** Teléfono: admite espacios, guiones, puntos y paréntesis; un `+` inicial opcional; 8 a 15 dígitos. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

const phoneSchema = z
  .string()
  .max(40)
  .refine((v) => normalizePhone(v) !== null, { message: "Teléfono no válido" })
  .transform((v) => normalizePhone(v) ?? "");

const rutSchema = z
  .string()
  .max(20)
  .refine((v) => normalizeRut(v) !== null, { message: "RUT no válido" })
  .transform((v) => normalizeRut(v) ?? "");

// Correo en minúsculas (se usa como clave de límite por correo). Máx. 254 (Flow lo exige).
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

const orderItemSchema = z.strictObject({
  sku: z.string().regex(SKU_REGEX),
  // Tope absoluto de 100 (máximo de `settings.maxQtyPerItem`); el tope configurado lo aplica
  // `computePricing` con los settings leídos.
  qty: z.number().int().safe().min(1).max(100),
});

const customerSchema = z.strictObject({
  firstName: text(1, 60),
  lastName: text(1, 60),
  email: emailSchema,
  phone: phoneSchema,
  rut: rutSchema,
});

const deliverySchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("shipping"),
    communeCode: z.string().regex(COMMUNE_CODE_REGEX),
    address: text(5, 200),
    notes: text(0, 300).optional(),
  }),
  z.strictObject({ type: z.literal("pickup") }),
]);

export const createOrderRequestSchema = z.strictObject({
  // UUID v4 generado por el navegador; clave de idempotencia. Se pasa a minúsculas para que la
  // misma clave en mayúsculas no genere otro pedido.
  clientRequestId: z.string().trim().toLowerCase().pipe(z.uuidv4()),
  items: z
    .array(orderItemSchema)
    .min(1)
    .max(20)
    .refine((items) => new Set(items.map((i) => i.sku)).size === items.length, { message: "SKU repetido" }),
  paymentMethod: z.enum(["flow", "transfer"]),
  customer: customerSchema,
  delivery: deliverySchema,
});

/** Request ya validado y normalizado (RUT `12345678-K`, correo en minúsculas, teléfono normalizado). */
export type CreateOrderRequest = z.output<typeof createOrderRequestSchema>;

/**
 * Valida el cuerpo de `createOrder`. Lanza `HttpsError`:
 *  - `INVALID_RUT` si el único problema es el RUT (falta, formato o dígito verificador);
 *  - `INVALID_INPUT` con `fields` (sin valores recibidos) en cualquier otro caso.
 */
export function parseCreateOrderRequest(data: unknown): CreateOrderRequest {
  const result = createOrderRequestSchema.safeParse(data);
  if (result.success) return result.data;

  const onlyRut = result.error.issues.every(
    (issue) => issue.path.length === 2 && issue.path[0] === "customer" && issue.path[1] === "rut",
  );
  if (onlyRut) throw appError("INVALID_RUT");
  throw invalidInputFromZod(result.error);
}
