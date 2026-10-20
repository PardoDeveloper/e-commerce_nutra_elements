import { isIP } from "node:net";

/**
 * IP del cliente para los límites de intentos. Se toma la ÚLTIMA entrada de `X-Forwarded-For`
 * (la que agrega la infraestructura de Google; las anteriores las puede inventar el cliente) y, si
 * no hay cabecera, la IP de la conexión. Devuelve `undefined` si no hay una IP válida: en ese caso
 * el llamador NO aplica el límite por IP (mejor no limitar que bloquear a todos con una clave común).
 *
 * NO verificado contra la infraestructura real (Cloud Run / Cloud Functions 2ª gen): si el último
 * elemento no fuera la IP del cliente, el límite sería menos útil, pero nunca bloquearía a todos.
 */
export function clientIpFrom(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  connectionIp?: string,
): string | undefined {
  const raw = headers["x-forwarded-for"];
  const joined = Array.isArray(raw) ? raw.join(",") : raw;
  const last = joined
    ?.split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .pop();
  if (last && isIP(last) !== 0) return last;
  if (connectionIp && isIP(connectionIp) !== 0) return connectionIp;
  return undefined;
}
