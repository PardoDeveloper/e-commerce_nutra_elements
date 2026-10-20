import { describe, expect, it } from "vitest";
import { normalizePhone, validateCheckout, type CheckoutFormValues } from "./validation";

const ctx = { communeCodes: ["puente-alto", "santiago"], pickupEnabled: true };
const valid: CheckoutFormValues = {
  firstName: " Ana ",
  lastName: "Pérez",
  email: "ana@correo.cl",
  phone: "+56 9 1234 5678",
  rut: "12.345.678-5",
  deliveryType: "shipping",
  communeCode: "puente-alto",
  address: "Av. Concha y Toro 100",
  notes: "",
  paymentMethod: "flow",
};

describe("validateCheckout", () => {
  it("acepta datos válidos y normaliza RUT, teléfono y textos", () => {
    const r = validateCheckout(valid, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.customer).toEqual({ firstName: "Ana", lastName: "Pérez", email: "ana@correo.cl", phone: "+56912345678", rut: "12345678-5" });
      expect(r.delivery).toEqual({ type: "shipping", communeCode: "puente-alto", address: "Av. Concha y Toro 100" });
    }
  });

  it("rechaza un RUT con dígito verificador incorrecto", () => {
    const r = validateCheckout({ ...valid, rut: "12.345.678-4" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.rut).toMatch(/RUT/);
  });

  it("exige RUT", () => {
    const r = validateCheckout({ ...valid, rut: "" }, ctx);
    expect(!r.ok && r.errors.rut).toBe("Ingresa tu RUT.");
  });

  it("retiro no pide comuna ni dirección", () => {
    const r = validateCheckout({ ...valid, deliveryType: "pickup", communeCode: "", address: "" }, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.delivery).toEqual({ type: "pickup" });
  });

  it("despacho exige comuna de la lista y dirección", () => {
    const r = validateCheckout({ ...valid, communeCode: "valparaiso", address: "abc" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.communeCode).toBeDefined();
      expect(r.errors.address).toBeDefined();
    }
  });

  it("exige medio de pago y correo válido", () => {
    const r = validateCheckout({ ...valid, paymentMethod: "", email: "x@y" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.paymentMethod).toBeDefined();
      expect(r.errors.email).toBeDefined();
    }
  });
});

describe("normalizePhone", () => {
  it("acepta 8 a 15 dígitos", () => {
    expect(normalizePhone("9 1234 5678")).toBe("912345678");
    expect(normalizePhone("1234567")).toBeNull();
    expect(normalizePhone("1234567890123456")).toBeNull();
    expect(normalizePhone("12345678a")).toBeNull();
  });
});
