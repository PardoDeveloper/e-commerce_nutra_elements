// Validación del formulario de checkout (cliente) y del servicio simulado. Lógica pura.
// Mismas reglas que el contrato functions.md 3.1; el servidor real las vuelve a validar.

import type { CreateOrderRequest, PaymentMethod } from "./types";

export interface CheckoutFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  deliveryType: "shipping" | "pickup";
  communeCode: string;
  address: string;
  notes: string;
  paymentMethod: PaymentMethod | "";
}

export type FieldKey = keyof CheckoutFormValues;
export type FieldErrors = Partial<Record<FieldKey, string>>;

export interface ValidationContext {
  communeCodes: readonly string[];
  pickupEnabled: boolean;
}

export type ValidationResult =
  | { ok: true; customer: CreateOrderRequest["customer"]; delivery: CreateOrderRequest["delivery"]; paymentMethod: PaymentMethod }
  | { ok: false; errors: FieldErrors };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "+56 9 1234 5678" -> "+56912345678". Devuelve null si no tiene 8 a 15 dígitos. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^\d]/g, "");
  if (/[^\d\s()+-]/.test(trimmed)) return null;
  if (digits.length < 8 || digits.length > 15) return null;
  return `${plus}${digits}`;
}

export function validateCheckout(values: CheckoutFormValues, ctx: ValidationContext): ValidationResult {
  const errors: FieldErrors = {};
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();
  const email = values.email.trim();

  if (firstName.length < 1) errors.firstName = "Ingresa tu nombre.";
  else if (firstName.length > 60) errors.firstName = "El nombre admite hasta 60 caracteres.";
  if (lastName.length < 1) errors.lastName = "Ingresa tu apellido.";
  else if (lastName.length > 60) errors.lastName = "El apellido admite hasta 60 caracteres.";

  if (email.length === 0) errors.email = "Ingresa tu correo.";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "Ingresa un correo válido, por ejemplo nombre@correo.cl.";

  const phone = normalizePhone(values.phone);
  if (values.phone.trim().length === 0) errors.phone = "Ingresa tu teléfono.";
  else if (phone === null) errors.phone = "Ingresa un teléfono de 8 a 15 dígitos, por ejemplo +56 9 1234 5678.";

  let delivery: CreateOrderRequest["delivery"] | null = null;
  if (values.deliveryType === "pickup") {
    if (!ctx.pickupEnabled) errors.deliveryType = "El retiro en tienda no está disponible.";
    else delivery = { type: "pickup" };
  } else {
    const address = values.address.trim();
    const notes = values.notes.trim();
    if (!values.communeCode) errors.communeCode = "Elige tu comuna.";
    else if (!ctx.communeCodes.includes(values.communeCode)) errors.communeCode = "Solo despachamos a comunas de la Región Metropolitana.";
    if (address.length < 5) errors.address = "Ingresa tu dirección (calle, número y depto.), mínimo 5 caracteres.";
    else if (address.length > 200) errors.address = "La dirección admite hasta 200 caracteres.";
    if (notes.length > 300) errors.notes = "Las indicaciones admiten hasta 300 caracteres.";
    if (!errors.communeCode && !errors.address && !errors.notes) {
      delivery = {
        type: "shipping",
        communeCode: values.communeCode,
        address,
        ...(notes.length > 0 ? { notes } : {}),
      };
    }
  }

  if (values.paymentMethod !== "flow") {
    errors.paymentMethod = "Elige un medio de pago.";
  }

  if (Object.keys(errors).length > 0 || phone === null || delivery === null || values.paymentMethod === "") {
    return { ok: false, errors };
  }
  return {
    ok: true,
    customer: { firstName, lastName, email, phone },
    delivery,
    paymentMethod: values.paymentMethod,
  };
}
