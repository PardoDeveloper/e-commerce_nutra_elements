// Guardia de las rutas de escritura de la demo (D-030). Pura: recibe la petición y devuelve un
// código HTTP de rechazo o null si puede continuar. Las rutas solo responden en este PC.
import { isPersistenceEnabled, WRITE_HEADER } from "./config";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostnameOf(host: string): string {
  // "[::1]:3000" -> "[::1]"; "localhost:3000" -> "localhost"
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  return host.split(":")[0] ?? "";
}

/**
 * 404 si la persistencia está desactivada (la ruta "no existe"). 403 si la petición no viene
 * de este PC (Host no loopback), de otro origen (CSRF) o sin la cabecera propia.
 */
export function rejectWrite(request: Request, env: Record<string, string | undefined> = process.env): 404 | 403 | null {
  if (!isPersistenceEnabled(env)) return 404;
  const host = request.headers.get("host") ?? "";
  if (!LOOPBACK_HOSTS.has(hostnameOf(host))) return 403;
  const origin = request.headers.get("origin");
  if (origin !== null) {
    try {
      if (new URL(origin).host !== host) return 403;
    } catch {
      return 403;
    }
  }
  if (request.headers.get(WRITE_HEADER) !== "1") return 403;
  return null;
}
