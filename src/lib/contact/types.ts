// Mensaje del formulario de contacto tal como lo ve el admin (data-model 2.x: contactMessages/{id}).
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  read: boolean;
  archived: boolean;
  /** ISO 8601. */
  createdAt: string;
}

/** Error de envío con mensaje apto para mostrar al visitante. */
export class ContactSendError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_INPUT" | "RATE_LIMITED" | "INTERNAL",
  ) {
    super(message);
    this.name = "ContactSendError";
  }
}

export const CONTACT_ERROR_MESSAGES: Record<ContactSendError["code"], string> = {
  INVALID_INPUT: "Revisa los datos del formulario.",
  RATE_LIMITED: "Enviaste varios mensajes seguidos. Intenta de nuevo en unos minutos.",
  INTERNAL: "No pudimos enviar tu mensaje. Intenta de nuevo en unos minutos.",
};
