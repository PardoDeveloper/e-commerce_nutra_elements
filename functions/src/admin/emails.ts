// Lógica pura de correos para la lista de administradores (D-031).

/** Normaliza un correo: sin espacios en los extremos y en minúsculas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Convierte el parámetro `ADMIN_EMAILS` (lista separada por comas) en un conjunto normalizado. */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  const result = new Set<string>();
  if (!raw) return result;
  for (const part of raw.split(",")) {
    const email = normalizeEmail(part);
    if (email.length > 0) result.add(email);
  }
  return result;
}

/** ¿El correo está en la lista? Una lista vacía no autoriza a nadie (falla cerrado). */
export function isAllowedAdminEmail(email: unknown, allowed: ReadonlySet<string>): boolean {
  if (typeof email !== "string") return false;
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && allowed.has(normalized);
}

/** Enmascara un correo para los logs: `c***@gmail.com`. Nunca se registra completo. */
export function maskEmail(email: unknown): string {
  if (typeof email !== "string") return "(sin correo)";
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
