import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { ContentionError, paths, type DocData } from "../common/db.js";
import { appError } from "../common/errors.js";
import { computePricing, type PricingProduct } from "../common/pricing.js";
import { parseCreateOrderRequest } from "../common/schemas.js";
import { buildCreateResponse, buildOrderDoc, planReserve, requestFingerprint, type CreateOrderResponse } from "./create-plan.js";
import {
  consumeAttempt,
  formatOrderNumber,
  deriveAccessToken,
  hashAccessToken,
  rateLimitDoc,
  rateLimitKey,
  readRateWindow,
  sha256Hex,
} from "./primitives.js";
import { parsePrivateSettings, parsePublicSettings } from "./settings.js";
import { parseOrder, parseStockProduct, type StockProduct } from "./types.js";
import { writeStock, type Deps } from "./tx.js";

// createOrder (functions.md 3.1). Una sola transacción: reserva el stock, toma el número del
// contador y crea el pedido con su snapshot. Nada del precio viene del cliente (D-005).

const RATE_WINDOW_MS = 10 * 60_000;
const IDEMPOTENCY_TTL_MS = 7 * 24 * 3600_000;

const pricingProductSchema = z.object({
  name: z.string(),
  price: z.number(),
  discount: z.object({ type: z.enum(["percent", "fixed"]), value: z.number() }).nullable().optional(),
  published: z.boolean(),
  active: z.boolean(),
  stock: z.number(),
  deletedAt: z.unknown().optional(),
});

export interface CreateOrderContext {
  /** IP del cliente, ya extraída. Sin IP no se aplica el límite por IP (se registra). */
  ip?: string | undefined;
}

export async function handleCreateOrder(deps: Deps, data: unknown, ctx: CreateOrderContext = {}): Promise<CreateOrderResponse> {
  const req = parseCreateOrderRequest(data);
  const { db, clock } = deps;

  const idemPath = paths.idempotencyKey(sha256Hex(req.clientRequestId));
  const fingerprint = requestFingerprint(req);

  // Fuera de la transacción: límite de pedidos pendientes por correo (no se cuenta si es un reintento
  // idempotente del mismo pedido).
  const [existingKey, privateData] = await Promise.all([db.get(idemPath), db.get(paths.settingsPrivate)]);
  if (!existingKey) {
    const limits = parsePrivateSettings(privateData).limits;
    const pending = await db.countPendingOrdersByEmail(req.customer.email, limits.pendingOrdersPerEmail);
    if (pending >= limits.pendingOrdersPerEmail) throw appError("RATE_LIMITED");
  }

  const ipKey = ctx.ip ? paths.rateLimit(rateLimitKey("createOrder", ctx.ip)) : undefined;
  if (!ipKey) logger.warn("createOrder sin IP: no se aplica el límite por IP");
  // Derivado del clientRequestId: un reintento idempotente devuelve el mismo token (M3).
  const token = deriveAccessToken(req.clientRequestId);
  const tokenHash = hashAccessToken(token);

  try {
    return await db.runTransaction(async (tx) => {
      // ---- Lecturas (todas antes de escribir) ----
      const skus = req.items.map((i) => i.sku);
      const fixed = [idemPath, paths.settingsPublic, paths.settingsPrivate, paths.countersOrders];
      const docs = await tx.getAll([...fixed, ...(ipKey ? [ipKey] : []), ...skus.map(paths.product)]);
      const [idemDoc, publicDoc, privateDoc, counterDoc] = docs;
      const ipDoc = ipKey ? docs[4] : undefined;
      const productDocs = docs.slice(ipKey ? 5 : 4);

      const now = clock();

      // Reintento idempotente: mismo pedido y MISMO token (derivado del clientRequestId); no se escribe nada.
      if (idemDoc) {
        const prevFingerprint = idemDoc["fingerprint"];
        const prevOrderNumber = idemDoc["orderNumber"];
        if (prevFingerprint !== fingerprint || typeof prevOrderNumber !== "string") throw appError("INVALID_INPUT");
        const orderData = await tx.get(paths.order(prevOrderNumber));
        if (!orderData) throw appError("INTERNAL");
        const order = parseOrder(orderData);
        if (order.paymentStatus !== "pending_payment") throw appError("ORDER_NOT_PAYABLE");
        if (order.accessTokenHash !== tokenHash) throw appError("INTERNAL"); // pedido creado con otro esquema de token: no debería existir
        return buildCreateResponse(order, token);
      }

      const settings = parsePublicSettings(publicDoc);
      const priv = parsePrivateSettings(privateDoc);

      // Límite por IP: solo se consume al crear el pedido (si falla antes, no cuenta).
      let ipWrite: DocData | undefined;
      if (ipKey) {
        const attempt = consumeAttempt(readRateWindow(ipDoc), now, RATE_WINDOW_MS, priv.limits.createOrderPerIpPer10Min);
        if (!attempt.allowed) throw appError("RATE_LIMITED");
        ipWrite = rateLimitDoc(attempt.next);
      }

      // Productos: uno eliminado o ilegible se trata igual que uno no publicado (D-029).
      const pricingProducts = new Map<string, PricingProduct>();
      const stockProducts = new Map<string, StockProduct>();
      skus.forEach((sku, i) => {
        const raw = productDocs[i];
        const parsed = raw ? pricingProductSchema.safeParse(raw) : undefined;
        if (!parsed?.success) {
          if (raw) logger.error("Producto con forma inesperada", { sku });
          return;
        }
        if (parsed.data.deletedAt !== null && parsed.data.deletedAt !== undefined) return;
        pricingProducts.set(sku, { sku, ...parsed.data });
        const stockProduct = parseStockProduct(sku, raw);
        if (stockProduct) stockProducts.set(sku, stockProduct);
      });

      const pricing = computePricing({ items: req.items, products: pricingProducts, settings, delivery: req.delivery });

      // ---- Número de pedido ----
      const lastRaw = counterDoc?.["last"];
      const last = typeof lastRaw === "number" && Number.isSafeInteger(lastRaw) && lastRaw >= 0 ? lastRaw : priv.orderNumberStart - 1;
      const number = last + 1;
      const orderNumber = formatOrderNumber(number);

      const reservedUntil = new Date(now.getTime() + priv.reservationMinutes[req.paymentMethod] * 60_000);
      const orderDoc = buildOrderDoc({
        orderNumber,
        number,
        req,
        pricing,
        settings,
        now,
        reservedUntil,
        accessTokenHash: tokenHash,
      });

      // ---- Escrituras ----
      writeStock(tx, planReserve(req.items, stockProducts), now);
      tx.set(paths.countersOrders, { last: number, updatedAt: now });
      tx.create(paths.order(orderNumber), orderDoc);
      tx.create(idemPath, {
        orderNumber,
        fingerprint,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      });
      if (ipKey && ipWrite) tx.set(ipKey, ipWrite);

      logger.info("Pedido creado", { orderNumber, total: pricing.total, paymentMethod: req.paymentMethod });
      return buildCreateResponse(
        {
          orderNumber,
          paymentMethod: req.paymentMethod,
          subtotal: pricing.subtotal,
          shipping: pricing.shipping,
          total: pricing.total,
          freeShippingApplied: pricing.freeShippingApplied,
          items: pricing.lines,
          reservedUntil,
        },
        token,
      );
    });
  } catch (err) {
    if (err instanceof ContentionError) throw appError("CONTENTION");
    throw err;
  }
}
