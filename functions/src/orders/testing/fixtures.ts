import { randomUUID } from "node:crypto";
import type { Clock, DocData } from "../../common/db.js";
import { MemoryDb } from "../../common/testing/memory-db.js";
import { computeRutDv } from "../../common/rut.js";
import { parseOrder, type OrderDoc } from "../types.js";
import type { Deps } from "../tx.js";

// Datos y ayudas comunes de los tests de pedidos y pagos (solo se usan en tests; excluido del build).

export const T0 = new Date("2026-10-20T15:00:00.000Z");

export interface TestClock extends Clock {
  advance(ms: number): void;
  set(date: Date): void;
}

export function makeClock(start: Date = T0): TestClock {
  let t = start.getTime();
  const clock = (() => new Date(t)) as TestClock;
  clock.advance = (ms) => {
    t += ms;
  };
  clock.set = (d) => {
    t = d.getTime();
  };
  return clock;
}

/** RUT válido y normalizado (dígito verificador calculado). */
export const RUT_BODY = "12345678";
export const VALID_RUT = `${RUT_BODY}-${computeRutDv(RUT_BODY)}`;

export const ADMIN_UID = "admin-uid-1";

export function productDoc(sku: string, overrides: DocData = {}): DocData {
  return {
    sku,
    name: `Producto ${sku}`,
    price: 10000,
    discount: null,
    finalPrice: 10000,
    stock: 5,
    reserved: 0,
    inStock: true,
    active: true,
    published: true,
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

export const SETTINGS_PUBLIC: DocData = {
  shippingFee: 3990,
  freeShippingThreshold: null,
  communes: [
    { code: "puente-alto", name: "Puente Alto" },
    { code: "santiago", name: "Santiago" },
  ],
  pickup: { enabled: true, address: "Av. Concha y Toro 180, Puente Alto", hours: "Lunes a viernes de 9:00 a 20:00" },
  maxQtyPerItem: 10,
  updatedAt: T0,
};

export const SETTINGS_PRIVATE: DocData = {
  reservationMinutes: { flow: 30, transfer: 2880 },
  bank: {
    bankName: "BANCO DE PRUEBA",
    accountType: "Cuenta corriente",
    accountNumber: "000000000",
    holderName: "Nutra Elements (prueba)",
    holderRut: "11.111.111-1",
  },
  orderNumberStart: 1,
  limits: { createOrderPerIpPer10Min: 5, pendingOrdersPerEmail: 3, orderStatusPerIpPer10Min: 120, orderStatusFailuresPerOrder: 10 },
  updatedAt: T0,
};

export interface TestEnv {
  db: MemoryDb;
  clock: TestClock;
  deps: Deps;
}

/** Base con ajustes y dos productos: 1001 (10.990 con 10 % de descuento, stock 5) y 1002 (8.990, stock 3). */
export function makeEnv(extraDocs: Record<string, DocData> = {}): TestEnv {
  const clock = makeClock();
  const db = new MemoryDb({
    "settings/public": SETTINGS_PUBLIC,
    "settings/private": SETTINGS_PRIVATE,
    "products/1001": productDoc("1001", { name: "Citrato de Magnesio x 120", price: 10990, discount: { type: "percent", value: 10 }, finalPrice: 9891, stock: 5 }),
    "products/1002": productDoc("1002", { name: "Vitamina C x 60", price: 8990, finalPrice: 8990, stock: 3 }),
    ...extraDocs,
  });
  return { db, clock, deps: { db, clock } };
}

export function validCreateRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    clientRequestId: randomUUID(),
    items: [{ sku: "1001", qty: 2 }],
    paymentMethod: "flow",
    customer: { firstName: "Ana", lastName: "Pérez", email: "ana@example.com", phone: "+56912345678", rut: VALID_RUT },
    delivery: { type: "shipping", communeCode: "puente-alto", address: "Calle Falsa 123, depto 4" },
    ...overrides,
  };
}

export function productStock(db: MemoryDb, sku: string): { stock: number; reserved: number; inStock: boolean } {
  const p = db.peek(`products/${sku}`);
  return { stock: p?.["stock"] as number, reserved: p?.["reserved"] as number, inStock: p?.["inStock"] as boolean };
}

/** Pedido de ejemplo (data-model.md 2.3): 2 x 1001 (9.891) + 1 x 1002 (8.990) + envío 3.990 = 32.762. Por defecto: Flow, pendiente, reservado. */
export function orderDoc(overrides: DocData = {}): DocData {
  return {
    orderNumber: "NE-000001",
    number: 1,
    paymentMethod: "flow",
    paymentStatus: "pending_payment",
    fulfillmentStatus: null,
    stockState: "reserved",
    reservedUntil: new Date(T0.getTime() + 30 * 60_000),
    customer: { firstName: "Ana", lastName: "Pérez", email: "ana@example.com", phone: "+56912345678", rut: VALID_RUT },
    delivery: { type: "shipping", communeCode: "puente-alto", communeName: "Puente Alto", address: "Calle Falsa 123, depto 4" },
    items: [
      { sku: "1001", name: "Citrato de Magnesio x 120", unitPrice: 10990, discount: { type: "percent", value: 10 }, unitFinalPrice: 9891, qty: 2, lineTotal: 19782 },
      { sku: "1002", name: "Vitamina C x 60", unitPrice: 8990, discount: null, unitFinalPrice: 8990, qty: 1, lineTotal: 8990 },
    ],
    subtotal: 28772,
    shipping: 3990,
    total: 32762,
    currency: "CLP",
    freeShippingApplied: false,
    accessTokenHash: "hash-de-prueba",
    flow: null,
    transfer: null,
    refund: null,
    review: null,
    statusHistory: [{ at: T0, kind: "payment", from: null, to: "pending_payment", by: "system" }],
    paidAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

export function order(overrides: DocData = {}): OrderDoc {
  return parseOrder(orderDoc(overrides));
}

/** Un pedido ya pagado, con la venta confirmada (`committed`). */
export function paidOrderDoc(overrides: DocData = {}): DocData {
  return orderDoc({
    paymentStatus: "paid",
    fulfillmentStatus: "preparing",
    stockState: "committed",
    paidAt: T0,
    ...overrides,
  });
}

export function flowState(overrides: DocData = {}): DocData {
  return {
    commerceOrder: "NE-000001",
    token: "TOKEN1",
    flowOrder: 111,
    paymentUrl: "https://sandbox.flow.cl/app/web/pay.php?token=TOKEN1",
    attempt: 1,
    createdAt: T0,
    lastStatus: null,
    lastCheckedAt: null,
    paidAt: null,
    amountPaid: null,
    paidFlowOrder: null,
    ...overrides,
  };
}
