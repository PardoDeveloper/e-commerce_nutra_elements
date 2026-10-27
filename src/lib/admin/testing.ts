// Fábricas para los tests del admin (no se importa desde código de la aplicación).
import type { AdminOrder, AdminProduct } from "./types";

export function makeProduct(over: Partial<AdminProduct> = {}): AdminProduct {
  const base: AdminProduct = {
    sku: "1001",
    sourceName: "PRODUCTO DE PRUEBA",
    name: "Producto de prueba",
    slug: "producto-de-prueba",
    description: "Texto",
    shortDescription: null,
    categoryId: "vitaminas",
    images: [{ path: "products/1001/a.webp", alt: "Frasco" }],
    price: 10000,
    discount: null,
    finalPrice: 10000,
    stock: 10,
    reserved: 0,
    inStock: true,
    active: true,
    published: true,
    format: null,
    unitsPerPack: null,
    seo: null,
    source: "manual",
    commissionPerUnit: null,
    deletedAt: null,
    deletedBy: null,
  };
  return { ...base, ...over };
}

export function makeOrder(over: Partial<AdminOrder> = {}): AdminOrder {
  const base: AdminOrder = {
    orderNumber: "NE-000001",
    number: 1,
    paymentMethod: "transfer",
    paymentStatus: "pending_payment",
    fulfillmentStatus: null,
    stockState: "reserved",
    customer: { firstName: "Ana", lastName: "Pérez", email: "ana@example.com", phone: "+56912345678", rut: "12345678-5" },
    delivery: { type: "shipping", communeCode: "puente-alto", communeName: "Puente Alto", address: "Calle 1" },
    items: [{ sku: "1001", name: "Producto de prueba", unitPrice: 10000, discount: null, unitFinalPrice: 10000, qty: 2, lineTotal: 20000, commissionPerUnit: null, commission: 0 }],
    subtotal: 20000,
    shipping: 3990,
    total: 23990,
    freeShippingApplied: false,
    transfer: null,
    refund: null,
    statusHistory: [{ at: "2026-10-10T12:00:00.000Z", kind: "payment", from: null, to: "pending_payment", by: "system" }],
    paidAt: null,
    createdAt: "2026-10-10T12:00:00.000Z",
    updatedAt: "2026-10-10T12:00:00.000Z",
  };
  return { ...base, ...over };
}

export const NOW = "2026-10-15T15:00:00.000Z";
export const CTX = { now: NOW, by: "demo-admin" };
