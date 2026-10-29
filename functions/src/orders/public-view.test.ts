import { describe, expect, it } from "vitest";
import { buildStatusResponse, TRACKING_NOTE } from "./public-view.js";
import { flowState, order, paidOrderDoc, T0, VALID_RUT } from "./testing/fixtures.js";

describe("buildStatusResponse", () => {
  it("devuelve solo lo permitido por el contrato", () => {
    const res = buildStatusResponse(order({ flow: flowState() }));
    expect(Object.keys(res).sort()).toEqual(
      ["orderNumber", "createdAt", "paymentMethod", "paymentStatus", "fulfillmentStatus", "reservedUntil", "delivery", "items", "subtotal", "shipping", "total", "trackingNote"].sort(),
    );
    expect(res.trackingNote).toBe(TRACKING_NOTE);
    expect(res.delivery).toEqual({ type: "shipping", communeName: "Puente Alto" });
    expect(res.items[0]).toEqual({ name: "Citrato de Magnesio x 120", qty: 2, lineTotal: 19782 });
    expect(res.reservedUntil).toBe(new Date(T0.getTime() + 30 * 60_000).toISOString());
  });

  it("no filtra datos personales ni internos (comparación contra lista prohibida)", () => {
    const o = order({
      flow: flowState(),
      transfer: { confirmedBy: "uid", confirmedAt: T0 },
      refund: { amount: 1000, method: "flow", note: "nota interna" },
      customer: { firstName: "Ana", lastName: "Pérez", email: "ana@example.com", phone: "+56912345678", rut: VALID_RUT },
      accessTokenHash: "secreto-hash-12345",
    });
    const json = JSON.stringify(buildStatusResponse(o));
    for (const forbidden of ["ana@example.com", "+56912345678", VALID_RUT, "Calle Falsa", "depto 4", "secreto-hash-12345", "TOKEN1", "sandbox.flow.cl", "nota interna", "statusHistory", "refund", "rut", "email", "phone", "address", "accessTokenHash", "Pérez"]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it("pedido retiro: dirección y horario de la tienda, no del cliente", () => {
    const res = buildStatusResponse(order({ delivery: { type: "pickup", storeAddress: "Av. Concha y Toro 180", storeHours: "L-V 9 a 20" } }));
    expect(res.delivery).toEqual({ type: "pickup", storeAddress: "Av. Concha y Toro 180", storeHours: "L-V 9 a 20" });
  });

  it("pedido antiguo por transferencia pendiente: sin instrucciones bancarias (D-044)", () => {
    expect(buildStatusResponse(order({ paymentMethod: "transfer" }))).not.toHaveProperty("transferInstructions");
  });

  it("reservedUntil es null fuera de pending_payment", () => {
    expect(buildStatusResponse(order(paidOrderDoc())).reservedUntil).toBeNull();
  });

  it("(j) un pedido reembolsado se ve como refunded, sin refund ni RUT", () => {
    const res = buildStatusResponse(
      order(paidOrderDoc({ paymentStatus: "refunded", refund: { amount: 32762, method: "flow", restocked: true } })),
    );
    expect(res.paymentStatus).toBe("refunded");
    const json = JSON.stringify(res);
    expect(json).not.toContain("restocked");
    expect(json).not.toContain(VALID_RUT);
  });
});
