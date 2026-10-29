// Datos de demostración del admin: productos con stock y pedidos ficticios. Todo es
// DETERMINISTA (generador con semilla fija): el mismo catálogo y la misma fecha dan los mismos
// datos en cada render. No usa Math.random ni copia datos de la planilla (el stock sale de un hash
// del SKU y no de la cantidad real).
import type { Product } from "@/lib/data/types";
import { computeRutDv } from "@/lib/rut";
import { lineCommission } from "./commission";
import { computeFinalPrice } from "./pricing";
import type { AdminOrder, AdminProduct, AdminSettings, FulfillmentStatus, OrderItem, StatusHistoryEntry } from "./types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** mulberry32: generador pseudoaleatorio con semilla. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Convierte el producto público (sin stock) en producto de admin con un stock ficticio estable. */
/** Demostración: comisiones ficticias por unidad (CLP). */
const DEMO_COMMISSIONS = [500, 800, 1000, 1500];

export function toAdminProduct(p: Product): AdminProduct {
  const stock = p.inStock ? 4 + (hashString(p.sku) % 57) : 0;
  return {
    sku: p.sku,
    sourceName: p.name.toUpperCase(),
    name: p.name,
    slug: p.slug,
    description: p.description,
    shortDescription: p.shortDescription,
    categoryId: p.categoryId,
    images: [],
    price: p.price,
    discount: p.discount,
    finalPrice: computeFinalPrice(p.price, p.discount),
    stock,
    reserved: 0,
    inStock: stock > 0,
    active: true,
    published: true,
    format: p.format,
    unitsPerPack: p.unitsPerPack,
    featured: p.featured,
    seo: p.seo,
    source: "controlfarma-xls",
    // Demostración: comisión ficticia y determinista para ver el cálculo en Ventas.
    commissionPerUnit: DEMO_COMMISSIONS[hashString(p.sku) % DEMO_COMMISSIONS.length]!,
    deletedAt: null,
    deletedBy: null,
  };
}

export function defaultSettings(base: {
  shippingFee: number;
  freeShippingThreshold: number | null;
  pickup: { enabled: boolean; address: string; hours: string };
  maxQtyPerItem: number;
}): AdminSettings {
  return {
    shippingFee: base.shippingFee,
    freeShippingThreshold: base.freeShippingThreshold,
    pickup: { ...base.pickup },
    maxQtyPerItem: base.maxQtyPerItem,
    reservationMinutes: { flow: 30 },
  };
}

const FIRST_NAMES = ["Camila", "Matías", "Valentina", "Benjamín", "Francisca", "Sebastián", "Javiera", "Tomás", "Constanza", "Felipe", "Daniela", "Cristóbal"];
const LAST_NAMES = ["González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras", "Silva", "Martínez", "Sepúlveda", "Morales", "Araya"];
const STREETS = ["Los Aromos", "Av. Principal", "Los Olmos", "Pasaje Central", "Las Acacias", "Av. Libertad", "Los Nogales"];

export interface SeedContext {
  products: AdminProduct[];
  communes: Array<{ code: string; name: string }>;
  settings: AdminSettings;
  /** Instante de referencia ("ahora"). */
  now: Date;
  /** Cuántos días hacia atrás cubrir. */
  days?: number;
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)] as T;
}

function makeRut(rng: () => number): string {
  const body = String(7_000_000 + Math.floor(rng() * 17_000_000));
  return `${body}-${computeRutDv(body)}`;
}

function makeItems(rng: () => number, pool: AdminProduct[]): OrderItem[] {
  const count = 1 + Math.floor(rng() * 3 * rng() + rng());
  const items: OrderItem[] = [];
  const used = new Set<string>();
  for (let i = 0; i < Math.min(count, 3); i++) {
    // Sesgo hacia los primeros productos: así hay "más vendidos" claros.
    const p = pool[Math.floor(rng() * rng() * pool.length)];
    if (!p || used.has(p.sku)) continue;
    used.add(p.sku);
    const qty = 1 + (rng() < 0.2 ? 1 : 0);
    items.push({
      sku: p.sku,
      name: p.name,
      unitPrice: p.price,
      discount: p.discount,
      unitFinalPrice: p.finalPrice,
      qty,
      lineTotal: p.finalPrice * qty,
      commissionPerUnit: p.commissionPerUnit,
      commission: lineCommission(qty, p.commissionPerUnit),
    });
  }
  return items.length > 0 ? items : [{ sku: pool[0]!.sku, name: pool[0]!.name, unitPrice: pool[0]!.price, discount: pool[0]!.discount, unitFinalPrice: pool[0]!.finalPrice, qty: 1, lineTotal: pool[0]!.finalPrice, commissionPerUnit: pool[0]!.commissionPerUnit, commission: lineCommission(1, pool[0]!.commissionPerUnit) }];
}

/** Pedidos ficticios, del más antiguo al más reciente (número ascendente). */
export function generateOrders(ctx: SeedContext): AdminOrder[] {
  const rng = createRng(20261015);
  const days = ctx.days ?? 90;
  const pool = ctx.products.filter((p) => p.inStock);
  if (pool.length === 0) return [];
  const nowMs = ctx.now.getTime();
  // `slow`: pedidos que tardan en pagarse (pueden quedar pendientes, vencer o cancelarse). Todos se pagan con Flow (D-044).
  const raw: Array<{ createdMs: number; paid: boolean; slow: boolean }> = [];

  for (let d = days - 1; d >= 0; d--) {
    // Más actividad hacia el presente, con variación por día.
    const perDay = 2 + Math.floor(rng() * 4) + (d < 30 ? 1 : 0);
    for (let k = 0; k < perDay; k++) {
      const window = d === 0 ? 6 * HOUR_MS : DAY_MS;
      const createdMs = nowMs - d * DAY_MS - Math.floor(rng() * window);
      raw.push({ createdMs, paid: true, slow: rng() >= 0.7 });
    }
  }
  raw.sort((a, b) => a.createdMs - b.createdMs);

  // Estados que la demo debe mostrar siempre (posición contada desde el pedido más reciente).
  const FORCED: Record<number, "pending" | "expired" | "cancelled"> = { 0: "pending", 3: "pending", 12: "expired", 16: "cancelled" };
  for (const fromEnd of Object.keys(FORCED).map(Number)) {
    const target = raw[raw.length - 1 - fromEnd];
    if (target) target.slow = true;
  }

  const orders: AdminOrder[] = raw.map((r, index) => {
    const number = index + 1;
    const orderNumber = `NE-${String(number).padStart(6, "0")}`;
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const items = makeItems(rng, pool);
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const pickup = rng() < 0.3 && ctx.settings.pickup.enabled;
    const commune = pick(rng, ctx.communes.length > 0 ? ctx.communes : [{ code: "puente-alto", name: "Puente Alto" }]);
    const freeShip = ctx.settings.freeShippingThreshold !== null && subtotal >= ctx.settings.freeShippingThreshold;
    const shipping = pickup || freeShip ? 0 : ctx.settings.shippingFee;
    const ageDays = (nowMs - r.createdMs) / DAY_MS;
    const createdAt = new Date(r.createdMs).toISOString();
    const paidMs = Math.min(nowMs, r.createdMs + (r.slow ? (1 + Math.floor(rng() * 20)) * HOUR_MS : 2 * 60_000));

    const base = {
      orderNumber,
      number,
      paymentMethod: "flow" as const,
      customer: {
        firstName: first,
        lastName: last,
        email: `${first}.${last}${number}@example.com`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
        phone: `+569${String(10_000_000 + Math.floor(rng() * 89_999_999))}`,
        rut: makeRut(rng),
      },
      delivery: pickup
        ? ({ type: "pickup", storeAddress: ctx.settings.pickup.address, storeHours: ctx.settings.pickup.hours } as const)
        : ({
            type: "shipping",
            communeCode: commune.code,
            communeName: commune.name,
            address: `${pick(rng, STREETS)} ${100 + Math.floor(rng() * 900)}`,
          } as const),
      items,
      subtotal,
      shipping,
      total: subtotal + shipping,
      freeShippingApplied: freeShip && !pickup,
      refund: null,
      createdAt,
    };

    const history: StatusHistoryEntry[] = [{ at: createdAt, kind: "payment", from: null, to: "pending_payment", by: "system" }];

    const forced = FORCED[raw.length - 1 - index];
    // Pedidos que siguen pendientes, vencidos o cancelados.
    if (forced === "pending" || (!forced && r.slow && ageDays < 1.2 && rng() < 0.6)) {
      return {
        ...base,
        paymentStatus: "pending_payment",
        fulfillmentStatus: null,
        stockState: "reserved",
        paidAt: null,
        statusHistory: history,
        updatedAt: createdAt,
      } satisfies AdminOrder;
    }
    if (forced === "expired" || forced === "cancelled" || (!forced && r.slow && ageDays >= 1.2 && ageDays < 4 && rng() < 0.15)) {
      const expired = forced ? forced === "expired" : rng() < 0.6;
      const at = new Date(Math.min(nowMs, r.createdMs + 2 * DAY_MS)).toISOString();
      return {
        ...base,
        paymentStatus: expired ? "expired" : "cancelled",
        fulfillmentStatus: null,
        stockState: "released",
        paidAt: null,
        statusHistory: [
          ...history,
          expired
            ? { at, kind: "payment", from: "pending_payment", to: "expired", by: "system" }
            : { at, kind: "payment", from: "pending_payment", to: "cancelled", by: "demo-admin", reason: "El cliente no completó el pago." },
        ],
        updatedAt: at,
      } satisfies AdminOrder;
    }

    const paidAt = new Date(paidMs).toISOString();
    history.push({ at: paidAt, kind: "payment", from: "pending_payment", to: "paid", by: "flow" });
    history.push({ at: paidAt, kind: "fulfillment", from: null, to: "preparing", by: "system" });
    const chain: FulfillmentStatus[] = ["preparing", base.delivery.type === "pickup" ? "ready_for_pickup" : "on_route", "delivered"];
    const reach = ageDays > 5 ? 2 : ageDays > 2 ? Math.floor(rng() * 3) : ageDays > 0.7 ? Math.floor(rng() * 2) : 0;
    for (let s = 1; s <= reach; s++) {
      history.push({
        at: new Date(Math.min(nowMs, paidMs + s * 8 * HOUR_MS)).toISOString(),
        kind: "fulfillment",
        from: chain[s - 1]!,
        to: chain[s]!,
        by: "demo-admin",
      });
    }
    const paidOrder: AdminOrder = {
      ...base,
      paymentStatus: "paid",
      fulfillmentStatus: chain[reach]!,
      stockState: "committed",
      paidAt,
      statusHistory: history,
      updatedAt: history[history.length - 1]!.at,
    };

    // ~4 % de los pedidos antiguos aparecen reembolsados (con y sin reposición de stock).
    if (ageDays > 6 && rng() < 0.04) {
      const restock = rng() < 0.5;
      const partial = rng() < 0.4;
      const amount = partial ? Math.max(1, Math.round(base.total / 2)) : base.total;
      const refundedAt = new Date(Math.min(nowMs, paidMs + 3 * DAY_MS)).toISOString();
      return {
        ...paidOrder,
        paymentStatus: "refunded",
        stockState: restock ? "released" : "committed",
        refund: {
          amount,
          method: "flow",
          refundedAt,
          note: "Reembolso de demostración.",
          restock,
          restocked: restock,
          recordedBy: "demo-admin",
          recordedAt: refundedAt,
        },
        statusHistory: [
          ...history,
          {
            at: refundedAt,
            kind: "payment",
            from: "paid",
            to: "refunded",
            by: "demo-admin",
            note: "Reembolso de demostración.",
            refund: { amount, method: "flow", restock },
          },
        ],
        updatedAt: refundedAt,
      };
    }
    return paidOrder;
  });

  return orders;
}
