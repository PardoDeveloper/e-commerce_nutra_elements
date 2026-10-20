import { describe, expect, it } from "vitest";
import {
  allowedActions,
  cancelOrder,
  confirmTransferPayment,
  nextFulfillment,
  previousFulfillment,
  recordManualRefund,
  updateFulfillment,
} from "./orders";
import { CTX, makeOrder } from "./testing";

const paid = (over = {}) =>
  makeOrder({ paymentStatus: "paid", fulfillmentStatus: "preparing", stockState: "committed", paidAt: "2026-10-12T12:00:00.000Z", ...over });

describe("acciones permitidas por estado", () => {
  it("pago pendiente por transferencia: confirmar y cancelar, nada más", () => {
    expect(allowedActions(makeOrder())).toEqual({ confirmTransfer: true, cancel: true, advanceTo: null, backTo: null, refund: false });
  });
  it("pago pendiente con Flow: no se confirma a mano", () => {
    expect(allowedActions(makeOrder({ paymentMethod: "flow" })).confirmTransfer).toBe(false);
  });
  it("expirado: se puede confirmar la transferencia, pero no cancelar", () => {
    const a = allowedActions(makeOrder({ paymentStatus: "expired", stockState: "released" }));
    expect(a.confirmTransfer).toBe(true);
    expect(a.cancel).toBe(false);
  });
  it("pagado en preparación: avanzar y reembolsar; no retroceder", () => {
    expect(allowedActions(paid())).toEqual({ confirmTransfer: false, cancel: false, advanceTo: "on_route", backTo: null, refund: true });
  });
  it("entregado: retrocede un paso según el tipo de entrega", () => {
    expect(previousFulfillment(paid({ fulfillmentStatus: "delivered" }))).toBe("on_route");
    expect(
      previousFulfillment(paid({ fulfillmentStatus: "delivered", delivery: { type: "pickup", storeAddress: "x", storeHours: "y" } })),
    ).toBe("ready_for_pickup");
    expect(nextFulfillment(paid({ fulfillmentStatus: "delivered" }))).toBeNull();
  });
  it("reembolsado, cancelado y en revisión: sin acciones", () => {
    for (const paymentStatus of ["refunded", "cancelled", "payment_review"] as const) {
      expect(allowedActions(makeOrder({ paymentStatus, fulfillmentStatus: "delivered" }))).toEqual({
        confirmTransfer: false,
        cancel: false,
        advanceTo: null,
        backTo: null,
        refund: false,
      });
    }
  });
});

describe("confirmTransferPayment", () => {
  it("pasa a pagado, deja en preparación y confirma el stock", () => {
    const r = confirmTransferPayment(makeOrder(), { reference: "ABC" }, { ...CTX, hasStock: true });
    expect(r.ok && r.order.paymentStatus).toBe("paid");
    expect(r.ok && r.order.fulfillmentStatus).toBe("preparing");
    expect(r.ok && r.order.stockState).toBe("committed");
    expect(r.ok && r.order.statusHistory.map((h) => h.to)).toEqual(["pending_payment", "paid", "preparing"]);
  });
  it("es idempotente si ya está pagado", () => {
    const r = confirmTransferPayment(paid(), {}, { ...CTX, hasStock: true });
    expect(r.ok && r.changed).toBe(false);
  });
  it("un pago de Flow no se confirma a mano", () => {
    const r = confirmTransferPayment(makeOrder({ paymentMethod: "flow" }), {}, { ...CTX, hasStock: true });
    expect(r).toMatchObject({ ok: false, code: "ORDER_NOT_TRANSFER" });
  });
  it("expirado sin stock queda en revisión de pago", () => {
    const r = confirmTransferPayment(makeOrder({ paymentStatus: "expired", stockState: "released" }), {}, { ...CTX, hasStock: false });
    expect(r.ok && r.order.paymentStatus).toBe("payment_review");
  });
  it("cancelado no se puede confirmar", () => {
    const r = confirmTransferPayment(makeOrder({ paymentStatus: "cancelled" }), {}, { ...CTX, hasStock: true });
    expect(r).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("cancelOrder", () => {
  it("solo desde pago pendiente y libera la reserva", () => {
    const r = cancelOrder(makeOrder(), "Sin pago", CTX);
    expect(r.ok && r.order.paymentStatus).toBe("cancelled");
    expect(r.ok && r.releaseItems).toBe(true);
  });
  it("un pedido pagado no se cancela", () => {
    expect(cancelOrder(paid(), "x", CTX)).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });
  it("exige motivo", () => {
    expect(cancelOrder(makeOrder(), "  ", CTX)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });
});

describe("updateFulfillment", () => {
  it("avanza sin motivo", () => {
    const r = updateFulfillment(paid(), "on_route", {}, CTX);
    expect(r.ok && r.order.fulfillmentStatus).toBe("on_route");
  });
  it("no se puede saltar un paso ni usar el estado del otro tipo de entrega", () => {
    expect(updateFulfillment(paid(), "delivered", {}, CTX)).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    expect(updateFulfillment(paid(), "ready_for_pickup", {}, CTX)).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });
  it("retroceder exige motivo y queda marcado en el historial", () => {
    const order = paid({ fulfillmentStatus: "delivered" });
    expect(updateFulfillment(order, "on_route", {}, CTX)).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    const r = updateFulfillment(order, "on_route", { reason: "Marcado por error" }, CTX);
    expect(r.ok && r.order.fulfillmentStatus).toBe("on_route");
    const last = r.ok ? r.order.statusHistory.at(-1) : undefined;
    expect(last).toMatchObject({ direction: "backward", reason: "Marcado por error" });
  });
  it("retroceder dos pasos es inválido", () => {
    expect(updateFulfillment(paid({ fulfillmentStatus: "delivered" }), "preparing", { reason: "x" }, CTX)).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
  });
  it("el mismo estado no cambia nada", () => {
    const r = updateFulfillment(paid(), "preparing", {}, CTX);
    expect(r.ok && r.changed).toBe(false);
  });
  it("exige pedido pagado", () => {
    expect(updateFulfillment(makeOrder(), "on_route", {}, CTX)).toMatchObject({ ok: false, code: "ORDER_NOT_PAID" });
    expect(updateFulfillment(paid({ paymentStatus: "refunded" }), "on_route", {}, CTX)).toMatchObject({ ok: false, code: "ORDER_NOT_PAID" });
  });
});

describe("recordManualRefund", () => {
  const input = { amount: 10000, method: "flow" as const, refundedAt: "2026-10-14T12:00:00.000Z", note: "Devuelto por Flow", restock: true };

  it("registra el reembolso y repone stock si corresponde", () => {
    const r = recordManualRefund(paid(), input, CTX);
    expect(r.ok && r.order.paymentStatus).toBe("refunded");
    expect(r.ok && r.order.refund?.restocked).toBe(true);
    expect(r.ok && r.restockItems).toBe(true);
    expect(r.ok && r.order.stockState).toBe("released");
  });
  it("sin reposición no toca el stock", () => {
    const r = recordManualRefund(paid(), { ...input, restock: false }, CTX);
    expect(r.ok && r.restockItems).toBe(false);
    expect(r.ok && r.order.stockState).toBe("committed");
  });
  it("es idempotente y no repone dos veces", () => {
    const first = recordManualRefund(paid(), input, CTX);
    if (!first.ok) throw new Error("debía funcionar");
    const second = recordManualRefund(first.order, { ...input, amount: 5 }, CTX);
    expect(second.ok && second.changed).toBe(false);
    expect(second.ok && second.restockItems).toBe(false);
  });
  it("valida monto, fecha y nota", () => {
    expect(recordManualRefund(paid(), { ...input, amount: 0 }, CTX)).toMatchObject({ code: "INVALID_REFUND_AMOUNT" });
    expect(recordManualRefund(paid(), { ...input, amount: 99999 }, CTX)).toMatchObject({ code: "INVALID_REFUND_AMOUNT" });
    expect(recordManualRefund(paid(), { ...input, amount: 10.5 }, CTX)).toMatchObject({ code: "INVALID_REFUND_AMOUNT" });
    expect(recordManualRefund(paid(), { ...input, refundedAt: "2026-10-16T12:00:00.000Z" }, CTX)).toMatchObject({ code: "INVALID_REFUND_DATE" });
    expect(recordManualRefund(paid(), { ...input, refundedAt: "2026-10-01T12:00:00.000Z" }, CTX)).toMatchObject({ code: "INVALID_REFUND_DATE" });
    expect(recordManualRefund(paid(), { ...input, note: " " }, CTX)).toMatchObject({ code: "INVALID_INPUT" });
  });
  it("solo desde pagado", () => {
    expect(recordManualRefund(makeOrder(), input, CTX)).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });
});
