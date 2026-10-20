// Formatos de fecha y números del admin (es-CL, America/Santiago).
import { TIME_ZONE } from "@/lib/admin/metrics";

const dateTime = new Intl.DateTimeFormat("es-CL", { timeZone: TIME_ZONE, dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("es-CL", { timeZone: TIME_ZONE, dateStyle: "medium" });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateOnly.format(new Date(iso));
}

/** `2026-10-14` -> `14-10`. */
export function shortDay(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}-${m}`;
}

/** Monto abreviado para el eje del gráfico: 120000 -> "$120 mil", 1500000 -> "$1,5 M". */
export function compactClp(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`;
  if (amount >= 1000) return `$${Math.round(amount / 1000).toLocaleString("es-CL")} mil`;
  return `$${amount}`;
}

/** Valor de `<input type="datetime-local">` (hora de Chile continental no se calcula: se usa la local del navegador). */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
