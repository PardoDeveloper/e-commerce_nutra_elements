import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAppErrorCode } from "../common/errors.js";
import { createFirestoreDb } from "../common/firestore-db.js";
import { systemClock } from "../common/db.js";
import { handleRecordManualRefund } from "./admin-orders.js";
import { handleCreateOrder } from "./create-order.js";
import { releaseExpiredReservations } from "./release-expired.js";
import { applyFlowStatus } from "../payments/apply-status.js";
import { orderDoc, paidOrderDoc, productDoc, SETTINGS_PRIVATE, SETTINGS_PUBLIC, validCreateRequest } from "./testing/fixtures.js";

// =====================================================================================
// PRUEBAS CONTRA FIRESTORE REAL (EMULADOR)  -  SIN EJECUTAR (D-026 / D-031)
//
// Estas pruebas están escritas pero NO se han ejecutado: no hay Java ni emuladores. No las recoge
// `npm test` (el proyecto "unit" excluye `*.emulator.test.ts`) y se saltan solas si falta
// FIRESTORE_EMULATOR_HOST. Para ejecutarlas (cuando Carlos autorice los emuladores):
//
//   firebase emulators:exec --only firestore --project demo-nutra \
//     "npx vitest run --config vitest.config.mts --dir src --testTimeout 60000 concurrency.emulator"
//
// (o con el emulador levantado y FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 en el entorno).
// Hasta que pasen, la concurrencia real (sin sobreventa, contador sin duplicados) y la
// idempotencia bajo carga NO están verificadas; solo lo están contra el doble en memoria.
// =====================================================================================

const enabled = Boolean(process.env["FIRESTORE_EMULATOR_HOST"]);

async function clearAll(db: Firestore): Promise<void> {
  for (const c of ["orders", "products", "counters", "settings", "rateLimits", "idempotencyKeys", "paymentEvents", "metrics"]) {
    await db.recursiveDelete(db.collection(c));
  }
}

describe.skipIf(!enabled)("SIN EJECUTAR - concurrencia real en Firestore (emulador)", () => {
  let admin: Firestore;
  const deps = () => ({ db: createFirestoreDb(), clock: systemClock });

  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: process.env["GCLOUD_PROJECT"] ?? "demo-nutra" });
    admin = getFirestore();
  });

  beforeEach(async () => {
    await clearAll(admin);
    await admin.doc("settings/public").set(SETTINGS_PUBLIC);
    await admin.doc("settings/private").set(SETTINGS_PRIVATE);
  });

  const buyer = (i: number, sku: string, qty: number) => {
    const base = validCreateRequest({ items: [{ sku, qty }] });
    return handleCreateOrder(deps(), { ...base, customer: { ...(base["customer"] as object), email: `c${i}@example.com` } }, { ip: `198.51.100.${i + 1}` });
  };

  it("stock 1 y 10 compradores en paralelo: un pedido y nueve OUT_OF_STOCK; stock 0 y reserved 1", async () => {
    await admin.doc("products/1002").set(productDoc("1002", { price: 8990, stock: 1 }));
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => buyer(i, "1002", 1)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => getAppErrorCode(r.reason) === "OUT_OF_STOCK")).toBe(true);
    const p = (await admin.doc("products/1002").get()).data();
    expect(p).toMatchObject({ stock: 0, reserved: 1, inStock: false });
  });

  it("stock 5 con compras de 2 en paralelo: no sobrevende y los números del contador no se repiten", async () => {
    await admin.doc("products/1002").set(productDoc("1002", { price: 8990, stock: 5 }));
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => buyer(i, "1002", 2)));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.orderNumber] : []));
    expect(ok.sort()).toEqual(["NE-000001", "NE-000002"]);
    expect((await admin.doc("products/1002").get()).data()).toMatchObject({ stock: 1, reserved: 4 });
  });

  it("20 pedidos simultáneos de un producto con mucho stock: números consecutivos sin repetirse (contador caliente)", async () => {
    await admin.doc("products/1002").set(productDoc("1002", { price: 8990, stock: 1000 }));
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => buyer(i, "1002", 1)));
    const numbers = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.orderNumber] : []));
    expect(new Set(numbers).size).toBe(numbers.length);
    // Si hubiera fallos por contención (CONTENTION), este test lo mostrará: es la medición que falta.
    expect(results.filter((r) => r.status === "rejected").map((r) => getAppErrorCode((r as PromiseRejectedResult).reason))).toEqual([]);
  });

  it("el mismo clientRequestId en paralelo crea un solo pedido", async () => {
    await admin.doc("products/1001").set(productDoc("1001", { price: 10000, stock: 10 }));
    const req = validCreateRequest({ items: [{ sku: "1001", qty: 1 }] });
    await Promise.allSettled(Array.from({ length: 5 }, () => handleCreateOrder(deps(), req, { ip: "203.0.113.5" })));
    expect((await admin.collection("orders").get()).size).toBe(1);
    expect((await admin.doc("products/1001").get()).data()).toMatchObject({ stock: 9, reserved: 1 });
  });

  it("flowConfirm: 5 confirmaciones en paralelo -> un solo paid y métricas +1", async () => {
    await admin.doc("orders/NE-000001").set(orderDoc({ flow: { commerceOrder: "NE-000001", token: "TOKEN1", flowOrder: 111, paymentUrl: "https://sandbox.flow.cl/x?token=TOKEN1", attempt: 1 } }));
    await admin.doc("products/1001").set(productDoc("1001", { stock: 3, reserved: 2 }));
    await admin.doc("products/1002").set(productDoc("1002", { stock: 2, reserved: 1 }));
    const status = { flowOrder: 111, commerceOrder: "NE-000001", status: 2, amount: 32762, currency: "CLP" };
    await Promise.all(Array.from({ length: 5 }, () => applyFlowStatus(deps(), "TOKEN1", status)));
    expect((await admin.doc("orders/NE-000001").get()).get("paymentStatus")).toBe("paid");
    const days = await admin.collection("metrics/daily/days").get();
    expect(days.docs[0]?.data()).toMatchObject({ ordersCount: 1, revenue: 32762 });
    expect((await admin.doc("paymentEvents/TOKEN1").get()).data()).toMatchObject({ receivedCount: 5, outcome: "paid" });
  });

  it("recordManualRefund: 5 llamadas en paralelo -> una sola reposición y un solo ajuste de métricas", async () => {
    await admin.doc("orders/NE-000001").set(paidOrderDoc({ paidAt: new Date(Date.now() - 3600_000) }));
    await admin.doc("products/1001").set(productDoc("1001", { stock: 3, reserved: 0 }));
    await admin.doc("products/1002").set(productDoc("1002", { stock: 2, reserved: 0 }));
    const req = { orderNumber: "NE-000001", amount: 32762, method: "flow", refundedAt: new Date(Date.now() - 60_000).toISOString(), note: "x", restock: true };
    const results = await Promise.all(Array.from({ length: 5 }, () => handleRecordManualRefund(deps(), req, "admin-uid")));
    expect(results.filter((r) => !r.alreadyRefunded)).toHaveLength(1);
    expect((await admin.doc("products/1001").get()).get("stock")).toBe(5);
  });

  it("releaseExpiredReservations: dos ejecuciones simultáneas reponen una sola vez", async () => {
    await admin.doc("orders/NE-000001").set(orderDoc({ reservedUntil: new Date(Date.now() - 1000) }));
    await admin.doc("products/1001").set(productDoc("1001", { stock: 3, reserved: 2 }));
    await admin.doc("products/1002").set(productDoc("1002", { stock: 2, reserved: 1 }));
    await Promise.all([releaseExpiredReservations(deps()), releaseExpiredReservations(deps())]);
    expect((await admin.doc("products/1001").get()).data()).toMatchObject({ stock: 5, reserved: 0 });
  });
});
