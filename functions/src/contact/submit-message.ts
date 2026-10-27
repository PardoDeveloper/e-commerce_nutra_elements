import { randomBytes } from "node:crypto";
import * as logger from "firebase-functions/logger";
import { z } from "zod";
import type { Clock, Db } from "../common/db.js";
import { appError } from "../common/errors.js";
import { rateLimitKey } from "../orders/primitives.js";
import { consumeRateLimit } from "../orders/rate-limit.js";
import { parseInput } from "../orders/schemas.js";

// submitContactMessage (functions.md 3.5): formulario público de /contacto. Guarda el mensaje en
// `contactMessages/{id}` para que el admin lo lea en /admin/mensajes. El cliente nunca escribe esa colección.

/** Mensajes por IP en la ventana de 10 minutos (RATE_WINDOW_MS). */
export const CONTACT_PER_IP_PER_10_MIN = 5;

export const contactPath = (id: string): string => `contactMessages/${id}`;

/** ¿Tiene caracteres de control? Con `allowNewlines`, se permiten tabulación y saltos de línea. */
function hasControlChars(v: string, allowNewlines = false): boolean {
  for (const ch of v) {
    const c = ch.charCodeAt(0);
    if (allowNewlines && (c === 9 || c === 10 || c === 13)) continue;
    if (c < 32 || c === 127) return true;
  }
  return false;
}

// Texto de una línea: sin saltos ni caracteres de control.
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !hasControlChars(v));

export const contactMessageSchema = z.strictObject({
  name: line(100).refine((v) => v.length >= 2),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  // Opcional; se guarda solo con dígitos y "+" (8 a 15 dígitos).
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v.replace(/[\s().-]/g, "") : ""))
    .refine((v) => v === "" || /^\+?\d{8,15}$/.test(v)),
  message: z
    .string()
    .trim()
    .min(10)
    .max(2000)
    .refine((v) => !hasControlChars(v, true)),
  // Trampa para bots: el formulario lo deja vacío y oculto.
  website: z.string().max(200).optional(),
});

export interface ContactDeps {
  db: Db;
  clock: Clock;
}

export interface ContactContext {
  ip?: string | undefined;
}

export async function handleSubmitContactMessage(deps: ContactDeps, data: unknown, ctx: ContactContext = {}): Promise<{ ok: true }> {
  const { db, clock } = deps;
  const input = parseInput(contactMessageSchema, data);

  if (ctx.ip) {
    const ok = await consumeRateLimit(db, clock, rateLimitKey("submitContactMessage", ctx.ip), CONTACT_PER_IP_PER_10_MIN);
    if (!ok) throw appError("RATE_LIMITED");
  } else {
    logger.warn("submitContactMessage sin IP: no se aplica el límite por IP");
  }

  // Bot: se responde como si se hubiera guardado, sin escribir nada.
  if (input.website) return { ok: true };

  const id = randomBytes(15).toString("base64url");
  const now = clock();
  await db.runTransaction(async (tx) => {
    tx.create(contactPath(id), {
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      message: input.message,
      read: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  });
  return { ok: true };
}
