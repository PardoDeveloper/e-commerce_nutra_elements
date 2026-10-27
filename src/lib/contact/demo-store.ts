// Mensajes de contacto en modo demostración (D-028): viven en localStorage, así el formulario público y
// /admin/mensajes se ven en el mismo navegador sin Firebase. Con "firebase" no se usa.
import type { ContactRequest } from "./validation";
import type { ContactMessage } from "./types";

export const DEMO_MESSAGES_KEY = "nutra-demo-contact-messages";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isMessage(v: unknown): v is ContactMessage {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    typeof m.email === "string" &&
    (m.phone === null || typeof m.phone === "string") &&
    typeof m.message === "string" &&
    typeof m.read === "boolean" &&
    typeof m.archived === "boolean" &&
    typeof m.createdAt === "string"
  );
}

export function readDemoMessages(storage: KeyValueStorage): ContactMessage[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(DEMO_MESSAGES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isMessage) : [];
  } catch {
    return [];
  }
}

export function writeDemoMessages(storage: KeyValueStorage, messages: readonly ContactMessage[]): void {
  try {
    storage.setItem(DEMO_MESSAGES_KEY, JSON.stringify(messages));
  } catch {
    // almacenamiento lleno o bloqueado: el cambio no se guarda
  }
}

export function addDemoMessage(storage: KeyValueStorage, request: Omit<ContactRequest, "website">, now: Date = new Date()): ContactMessage {
  const message: ContactMessage = {
    id: `demo-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: request.name,
    email: request.email,
    phone: request.phone || null,
    message: request.message,
    read: false,
    archived: false,
    createdAt: now.toISOString(),
  };
  writeDemoMessages(storage, [message, ...readDemoMessages(storage)]);
  return message;
}
