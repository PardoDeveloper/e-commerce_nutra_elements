// Validación del formulario de contacto. Lógica pura: mismas reglas que submitContactMessage
// (functions.md 3.5); el servidor las vuelve a validar.
import { normalizePhone } from "@/lib/checkout/validation";

export interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  message: string;
}

export type ContactField = keyof ContactFormValues;
export type ContactErrors = Partial<Record<ContactField, string>>;

/** Lo que se envía a la función (teléfono normalizado o vacío). */
export interface ContactRequest {
  name: string;
  email: string;
  phone: string;
  message: string;
  /** Trampa para bots: siempre vacía desde el formulario real. */
  website: string;
}

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateContact(values: ContactFormValues): { ok: true; request: Omit<ContactRequest, "website"> } | { ok: false; errors: ContactErrors } {
  const errors: ContactErrors = {};
  const name = values.name.trim();
  const email = values.email.trim().toLowerCase();
  const message = values.message.trim();

  if (name.length === 0) errors.name = "Ingresa tu nombre completo.";
  else if (name.length < 2 || name.length > 100) errors.name = "El nombre debe tener entre 2 y 100 caracteres.";

  if (email.length === 0) errors.email = "Ingresa tu correo electrónico.";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "Ingresa un correo válido, por ejemplo nombre@correo.cl.";

  let phone = "";
  if (values.phone.trim().length > 0) {
    const normalized = normalizePhone(values.phone);
    if (normalized === null) errors.phone = "Ingresa un teléfono de 8 a 15 dígitos, por ejemplo +56 9 1234 5678.";
    else phone = normalized;
  }

  if (message.length === 0) errors.message = "Escribe tu mensaje.";
  else if (message.length < MESSAGE_MIN) errors.message = `El mensaje debe tener al menos ${MESSAGE_MIN} caracteres.`;
  else if (message.length > MESSAGE_MAX) errors.message = `El mensaje admite hasta ${MESSAGE_MAX} caracteres.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, request: { name, email, phone, message } };
}
