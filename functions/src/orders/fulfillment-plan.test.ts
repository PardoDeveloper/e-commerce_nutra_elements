import { describe, expect, it } from "vitest";
import { getAppErrorCode } from "../common/errors.js";
import { planFulfillment } from "./fulfillment-plan.js";
import { order, T0 } from "./testing/fixtures.js";
import type { FulfillmentStatus } from "./types.js";

const NOW = new Date(T0.getTime() + 60_000);

const SHIPPING = { type: "shipping", communeCode: "puente-alto", communeName: "Puente Alto", address: "Calle 1 #123" };
const PICKUP = { type: "pickup", storeAddress: "Av. Concha y Toro 180", storeHours: "L-V 9 a 20" };

function plan(delivery: Record<string, unknown>, from: FulfillmentStatus | null, to: FulfillmentStatus, extra: { reason?: string; note?: string } = {}, paymentStatus = "paid") {
  return planFulfillment({ order: order({ paymentStatus, fulfillmentStatus: from, delivery, stockState: "committed" }), to, now: NOW, uid: "uid-1", ...extra });
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return getAppErrorCode(err);
  }
  return undefined;
}

describe("planFulfillment - hacia adelante", () => {
  it("despacho: preparing -> on_route -> delivered", () => {
    expect(plan(SHIPPING, "preparing", "on_route")).toMatchObject({ kind: "change", direction: "forward" });
    expect(plan(SHIPPING, "on_route", "delivered")).toMatchObject({ kind: "change", direction: "forward" });
  });
  it("retiro: preparing -> ready_for_pickup -> delivered", () => {
    expect(plan(PICKUP, "preparing", "ready_for_pickup")).toMatchObject({ kind: "change", direction: "forward" });
    expect(plan(PICKUP, "ready_for_pickup", "delivered")).toMatchObject({ kind: "change", direction: "forward" });
  });
  it("ready_for_pickup solo en retiro y on_route solo en despacho", () => {
    expect(codeOf(() => plan(SHIPPING, "preparing", "ready_for_pickup"))).toBe("INVALID_TRANSITION");
    expect(codeOf(() => plan(PICKUP, "preparing", "on_route"))).toBe("INVALID_TRANSITION");
  });
  it("no se puede saltar un paso (preparing -> delivered)", () => {
    expect(codeOf(() => plan(SHIPPING, "preparing", "delivered"))).toBe("INVALID_TRANSITION");
    expect(codeOf(() => plan(PICKUP, "preparing", "delivered"))).toBe("INVALID_TRANSITION");
  });
  it("la entrada del historial lleva quién, nota y sin direction", () => {
    const p = plan(SHIPPING, "preparing", "on_route", { note: "Salió con el chofer" });
    expect(p.kind).toBe("change");
    if (p.kind !== "change") return;
    const history = p.orderPatch["statusHistory"] as Record<string, unknown>[];
    const last = history[history.length - 1];
    expect(last).toMatchObject({ kind: "fulfillment", from: "preparing", to: "on_route", by: "uid-1", note: "Salió con el chofer" });
    expect(last).not.toHaveProperty("direction");
  });
});

describe("planFulfillment - retroceso (D-024 P9)", () => {
  it("un paso atrás con motivo, queda con direction backward y reason", () => {
    const p = plan(SHIPPING, "delivered", "on_route", { reason: "Clic equivocado" });
    expect(p).toMatchObject({ kind: "change", direction: "backward" });
    if (p.kind !== "change") return;
    const history = p.orderPatch["statusHistory"] as Record<string, unknown>[];
    expect(history[history.length - 1]).toMatchObject({ direction: "backward", reason: "Clic equivocado", from: "delivered", to: "on_route" });
  });
  it("delivered -> ready_for_pickup en retiro; ready/on_route -> preparing", () => {
    expect(plan(PICKUP, "delivered", "ready_for_pickup", { reason: "x" })).toMatchObject({ direction: "backward" });
    expect(plan(PICKUP, "ready_for_pickup", "preparing", { reason: "x" })).toMatchObject({ direction: "backward" });
    expect(plan(SHIPPING, "on_route", "preparing", { reason: "x" })).toMatchObject({ direction: "backward" });
  });
  it("sin motivo -> REASON_REQUIRED", () => {
    expect(codeOf(() => plan(SHIPPING, "delivered", "on_route"))).toBe("REASON_REQUIRED");
    expect(codeOf(() => plan(SHIPPING, "on_route", "preparing"))).toBe("REASON_REQUIRED");
  });
  it("retroceder dos pasos -> INVALID_TRANSITION (aunque lleve motivo)", () => {
    expect(codeOf(() => plan(SHIPPING, "delivered", "preparing", { reason: "x" }))).toBe("INVALID_TRANSITION");
    expect(codeOf(() => plan(PICKUP, "delivered", "preparing", { reason: "x" }))).toBe("INVALID_TRANSITION");
  });
  it("retroceder al tipo de entrega equivocado -> INVALID_TRANSITION", () => {
    expect(codeOf(() => plan(SHIPPING, "delivered", "ready_for_pickup", { reason: "x" }))).toBe("INVALID_TRANSITION");
  });
});

describe("planFulfillment - otros casos", () => {
  it("el mismo estado es idempotente: noop sin entrada nueva ni exigir motivo", () => {
    expect(plan(SHIPPING, "on_route", "on_route")).toEqual({ kind: "noop" });
    expect(plan(SHIPPING, "preparing", "preparing")).toEqual({ kind: "noop" });
  });
  it.each(["pending_payment", "payment_review", "expired", "cancelled", "refunded"])("con pago %s -> ORDER_NOT_PAID", (status) => {
    expect(codeOf(() => plan(SHIPPING, null, "preparing", {}, status))).toBe("ORDER_NOT_PAID");
  });
  it("un pedido pagado sin estado logístico (dato corrupto) no avanza", () => {
    expect(codeOf(() => plan(SHIPPING, null, "on_route"))).toBe("INVALID_TRANSITION");
  });
});
