import { describe, expect, it } from "vitest";
import { ContentionError, increment } from "../db.js";
import { MemoryDb } from "./memory-db.js";

// Pruebas del DOBLE en memoria: si el doble fallara, los tests que dependen de él no valdrían nada.

describe("MemoryDb", () => {
  it("lee, escribe, hace merge e incrementa", async () => {
    const db = new MemoryDb({ "a/1": { n: 1, name: "x" } });
    await db.runTransaction(async (tx) => {
      await tx.get("a/1");
      tx.set("a/1", { n: increment(4) }, { merge: true });
      tx.set("a/2", { n: increment(2) }, { merge: true }); // crea con increment sobre campo ausente
    });
    expect(db.peek("a/1")).toEqual({ n: 5, name: "x" });
    expect(db.peek("a/2")).toEqual({ n: 2 });
  });

  it("set sin merge reemplaza el documento", async () => {
    const db = new MemoryDb({ "a/1": { n: 1, name: "x" } });
    await db.runTransaction(async (tx) => {
      tx.set("a/1", { n: 9 });
    });
    expect(db.peek("a/1")).toEqual({ n: 9 });
  });

  it("create falla si existe y update falla si no existe, sin dejar la transacción a medias", async () => {
    const db = new MemoryDb({ "a/1": { n: 1 } });
    await expect(
      db.runTransaction(async (tx) => {
        tx.update("a/1", { n: 2 });
        tx.create("a/1", { n: 3 });
      }),
    ).rejects.toThrow(/ALREADY_EXISTS/);
    expect(db.peek("a/1")).toEqual({ n: 1 });
    await expect(
      db.runTransaction(async (tx) => {
        tx.update("a/zzz", { n: 2 });
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("exige lecturas antes de escrituras", async () => {
    const db = new MemoryDb({ "a/1": { n: 1 } });
    await expect(
      db.runTransaction(async (tx) => {
        tx.set("a/2", { n: 1 });
        await tx.get("a/1");
      }),
    ).rejects.toThrow(/lecturas antes/);
  });

  it("rechaza undefined y claves con punto en update", async () => {
    const db = new MemoryDb({ "a/1": { n: 1 } });
    await expect(
      db.runTransaction(async (tx) => {
        tx.set("a/2", { n: undefined });
      }),
    ).rejects.toThrow(/undefined/);
    await expect(
      db.runTransaction(async (tx) => {
        tx.update("a/1", { "x.y": 1 });
      }),
    ).rejects.toThrow(/punto/);
  });

  it("reintenta una transacción si otra confirma un documento que ya había leído", async () => {
    const db = new MemoryDb({ "c/1": { n: 0 } });
    // Diez incrementos concurrentes de "leer y escribir n+1": sin control de versiones se perderían.
    await Promise.all(
      Array.from({ length: 10 }, () =>
        db.runTransaction(async (tx) => {
          const cur = (await tx.get("c/1")) as { n: number };
          tx.set("c/1", { n: cur.n + 1 });
        }),
      ),
    );
    expect(db.peek("c/1")).toEqual({ n: 10 });
    expect(db.retries).toBeGreaterThan(0);
  });

  it("lanza ContentionError al agotar los reintentos", async () => {
    const db = new MemoryDb({ "c/1": { n: 0 } });
    const attempt = db.runTransaction(async (tx) => {
      await tx.get("c/1");
      // Otro escritor modifica el documento en cada intento: nunca se puede confirmar.
      db.seed("c/1", { n: Math.random() });
      tx.set("c/2", { ok: true });
    });
    await expect(attempt).rejects.toBeInstanceOf(ContentionError);
    expect(db.peek("c/2")).toBeUndefined();
  });

  it("lista pedidos vencidos y cuenta pendientes por correo", async () => {
    const past = new Date("2026-01-01T00:00:00Z");
    const future = new Date("2027-01-01T00:00:00Z");
    const db = new MemoryDb({
      "orders/NE-000001": { paymentStatus: "pending_payment", reservedUntil: past, customer: { email: "a@x.cl" } },
      "orders/NE-000002": { paymentStatus: "pending_payment", reservedUntil: future, customer: { email: "a@x.cl" } },
      "orders/NE-000003": { paymentStatus: "paid", reservedUntil: past, customer: { email: "a@x.cl" } },
    });
    expect(await db.listExpiredPendingOrderIds(new Date("2026-06-01T00:00:00Z"), 10)).toEqual(["NE-000001"]);
    expect(await db.countPendingOrdersByEmail("a@x.cl", 10)).toBe(2);
    expect(await db.countPendingOrdersByEmail("a@x.cl", 1)).toBe(1);
  });
});
