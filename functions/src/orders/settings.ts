import * as logger from "firebase-functions/logger";
import { z } from "zod";
import type { DocData } from "../common/db.js";
import { appError } from "../common/errors.js";
import type { PricingSettings } from "../common/pricing.js";

// Lectura defensiva de `settings/public` y `settings/private` (data-model.md 2.5). Si un valor
// opcional falta se usa el inicial del contrato. Si falta lo imprescindible (la tienda no está
// configurada) es un error NUESTRO: `INTERNAL`, sin detalles hacia el cliente.

export const DEFAULT_RESERVATION_MINUTES = { flow: 30 } as const;
export const DEFAULT_LIMITS = {
  createOrderPerIpPer10Min: 5,
  pendingOrdersPerEmail: 3,
  // 120: el polling de la página de retorno de Flow hace 18 a 30 consultas en 90 s (D-032).
  orderStatusPerIpPer10Min: 120,
  orderStatusFailuresPerOrder: 10,
  // flowConfirm: Flow llama desde pocas IPs, por eso el valor es holgado; frena el abuso, no el uso normal.
  flowConfirmPerIpPer10Min: 300,
} as const;

const publicSchema = z.object({
  shippingFee: z.number().int(),
  freeShippingThreshold: z.number().nullable(),
  communes: z.array(z.object({ code: z.string(), name: z.string() })),
  pickup: z.object({ enabled: z.boolean(), address: z.string().default(""), hours: z.string().default("") }),
  maxQtyPerItem: z.number().int().optional(),
});

const privateSchema = z.object({
  // Los datos bancarios y la reserva de transferencia que hubiera en el documento se ignoran (D-044).
  reservationMinutes: z.object({ flow: z.number().optional() }).optional(),
  orderNumberStart: z.number().int().optional(),
  limits: z
    .object({
      createOrderPerIpPer10Min: z.number().int().optional(),
      pendingOrdersPerEmail: z.number().int().optional(),
      orderStatusPerIpPer10Min: z.number().int().optional(),
      orderStatusFailuresPerOrder: z.number().int().optional(),
      flowConfirmPerIpPer10Min: z.number().int().optional(),
    })
    .optional(),
});

export type PublicSettings = PricingSettings & { pickup: { enabled: boolean; address: string; hours: string } };

export interface PrivateSettings {
  reservationMinutes: { flow: number };
  orderNumberStart: number;
  limits: { [K in keyof typeof DEFAULT_LIMITS]: number };
}

export function parsePublicSettings(data: DocData | undefined): PublicSettings {
  const result = publicSchema.safeParse(data);
  if (!result.success) {
    logger.error("settings/public ausente o con forma inesperada", { paths: result.error.issues.slice(0, 5).map((i) => i.path.join(".")) });
    throw appError("INTERNAL");
  }
  const s = result.data;
  return {
    shippingFee: s.shippingFee,
    freeShippingThreshold: s.freeShippingThreshold,
    communes: s.communes,
    pickup: s.pickup,
    ...(s.maxQtyPerItem !== undefined ? { maxQtyPerItem: s.maxQtyPerItem } : {}),
  };
}

const inRange = (n: number | undefined, min: number, max: number, fallback: number): number =>
  n !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : fallback;

/** `settings/private` ausente: se usan los valores iniciales (la reserva y los límites tienen inicial). */
export function parsePrivateSettings(data: DocData | undefined): PrivateSettings {
  const result = privateSchema.safeParse(data ?? {});
  const s: z.output<typeof privateSchema> = result.success ? result.data : {};
  if (!result.success) logger.warn("settings/private con forma inesperada; se usan valores iniciales");
  const limits = s.limits;
  const reservation = s.reservationMinutes;
  return {
    reservationMinutes: {
      flow: inRange(reservation?.flow, 5, 240, DEFAULT_RESERVATION_MINUTES.flow),
    },
    orderNumberStart: inRange(s.orderNumberStart, 1, 100_000_000, 1),
    limits: {
      createOrderPerIpPer10Min: inRange(limits?.createOrderPerIpPer10Min, 1, 100, DEFAULT_LIMITS.createOrderPerIpPer10Min),
      pendingOrdersPerEmail: inRange(limits?.pendingOrdersPerEmail, 1, 50, DEFAULT_LIMITS.pendingOrdersPerEmail),
      orderStatusPerIpPer10Min: inRange(limits?.orderStatusPerIpPer10Min, 1, 1000, DEFAULT_LIMITS.orderStatusPerIpPer10Min),
      orderStatusFailuresPerOrder: inRange(limits?.orderStatusFailuresPerOrder, 1, 100, DEFAULT_LIMITS.orderStatusFailuresPerOrder),
      flowConfirmPerIpPer10Min: inRange(limits?.flowConfirmPerIpPer10Min, 1, 10_000, DEFAULT_LIMITS.flowConfirmPerIpPer10Min),
    },
  };
}
