import { z } from "zod";
import { invalidInputFromZod } from "../common/errors.js";
import { ORDER_NUMBER_REGEX } from "./primitives.js";

// Esquemas de entrada de los callables de pedidos (functions.md 3.2, 3.4 y 4). Estrictos: campos
// desconocidos -> INVALID_INPUT. Los mensajes de error nunca incluyen el valor recibido.

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

function text(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !CONTROL_CHARS.test(v), { message: "Contiene caracteres no permitidos" });
}

const orderNumber = z.string().regex(ORDER_NUMBER_REGEX).max(20);
const accessToken = z.string().min(10).max(100).regex(/^[A-Za-z0-9_-]+$/);

export const orderAccessSchema = z.strictObject({ orderNumber, accessToken });

export const confirmTransferSchema = z.strictObject({
  orderNumber,
  reference: text(1, 100).optional(),
  note: text(1, 300).optional(),
});

export const resolveReviewSchema = z.strictObject({
  orderNumber,
  action: z.enum(["accept", "cancel"]),
  note: text(1, 300),
});

export const cancelOrderSchema = z.strictObject({ orderNumber, reason: text(1, 300) });

export const updateFulfillmentSchema = z.strictObject({
  orderNumber,
  to: z.enum(["preparing", "ready_for_pickup", "on_route", "delivered"]),
  note: text(1, 300).optional(),
  reason: text(1, 300).optional(),
});

export const recordRefundSchema = z.strictObject({
  orderNumber,
  // El rango del monto lo valida el handler (INVALID_REFUND_AMOUNT), que conoce el total del pedido.
  amount: z.number(),
  method: z.enum(["flow", "transfer"]),
  refundedAt: z.iso.datetime().max(40),
  note: text(1, 300),
  restock: z.boolean(),
});

/** Parsea con el esquema o lanza `INVALID_INPUT` con `fields`. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw invalidInputFromZod(result.error);
  return result.data;
}
