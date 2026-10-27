// Mensajes de contacto en el admin (/admin/mensajes). Lógica pura de filtros y conversión;
// los almacenes (demo y Firebase) están en `messages-store.ts`.
import type { ContactMessage } from "@/lib/contact/types";
import { dayKey } from "./metrics";
import { toIso } from "./firebase-mappers";

export type MessageFolder = "inbox" | "archived";
export type MessageReadFilter = "all" | "unread" | "read";

export interface MessageFilters {
  folder: MessageFolder;
  read: MessageReadFilter;
  /** `YYYY-MM-DD` (America/Santiago), inclusive. Vacío = sin límite. */
  from: string;
  to: string;
  query: string;
}

export const DEFAULT_MESSAGE_FILTERS: MessageFilters = { folder: "inbox", read: "all", from: "", to: "", query: "" };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Aplica los filtros y ordena del más reciente al más antiguo. */
export function filterMessages(messages: readonly ContactMessage[], f: MessageFilters): ContactMessage[] {
  const q = normalize(f.query.trim());
  // Si el rango viene invertido, se corrige en vez de no mostrar nada.
  const [from, to] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
  return messages
    .filter((m) => {
      if (m.archived !== (f.folder === "archived")) return false;
      if (f.read === "unread" && m.read) return false;
      if (f.read === "read" && !m.read) return false;
      if (from || to) {
        const day = dayKey(m.createdAt);
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      if (q && !normalize(`${m.name} ${m.email} ${m.phone ?? ""} ${m.message}`).includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface MessageCounts {
  inbox: number;
  unread: number;
  archived: number;
}

export function countMessages(messages: readonly ContactMessage[]): MessageCounts {
  let inbox = 0;
  let unread = 0;
  let archived = 0;
  for (const m of messages) {
    if (m.archived) archived++;
    else {
      inbox++;
      if (!m.read) unread++;
    }
  }
  return { inbox, unread, archived };
}

/** Documento de `contactMessages` a mensaje del admin. Devuelve null si no es válido. */
export function toContactMessage(id: string, data: Record<string, unknown>): ContactMessage | null {
  const createdAt = toIso(data.createdAt);
  if (typeof data.name !== "string" || typeof data.email !== "string" || typeof data.message !== "string" || !createdAt) return null;
  return {
    id,
    name: data.name,
    email: data.email,
    phone: typeof data.phone === "string" && data.phone ? data.phone : null,
    message: data.message,
    read: data.read === true,
    archived: data.archived === true,
    createdAt,
  };
}
