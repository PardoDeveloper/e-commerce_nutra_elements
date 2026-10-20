import { FLOW_PRODUCTION_BASE, FLOW_SANDBOX_BASE } from "./flow-client.js";

// Configuración de Flow por ambiente (functions.md 3.3.1 y 7.1). Lógica pura: recibe los valores
// (de variables de entorno y secretos) y los valida. No lee `process.env` por su cuenta.
//
// Guarda de seguridad: en `local` y `staging` solo se acepta el sandbox; en `production`, solo la
// API real. Si no coinciden la configuración se rechaza y NO se llama a Flow: así un error de
// configuración no cobra de verdad. (Se evalúa al primer uso de cada instancia, no al cargar el
// módulo, porque durante el análisis del despliegue los valores aún no existen.)

export type AppEnv = "local" | "staging" | "production";

export interface FlowEnvInput {
  APP_ENV?: string | undefined;
  FLOW_API_BASE?: string | undefined;
  FLOW_CONFIRMATION_URL?: string | undefined;
  SITE_URL?: string | undefined;
  FLOW_API_KEY?: string | undefined;
  FLOW_SECRET_KEY?: string | undefined;
}

export interface FlowConfig {
  appEnv: AppEnv;
  apiBase: string;
  apiKey: string;
  secretKey: string;
  confirmationUrl: string;
  siteUrl: string;
}

/** Error de configuración (es nuestro, no del cliente). `problems` solo nombra variables, nunca valores. */
export class FlowConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuración de Flow no válida: ${problems.join("; ")}`);
    this.name = "FlowConfigError";
  }
}

const stripSlash = (s: string): string => s.trim().replace(/\/+$/, "");

function parseUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

/**
 * `scope: "api"` valida solo lo necesario para consultar a Flow (`getStatus`: ambiente, base, claves);
 * `"full"` (por defecto) agrega las URLs de confirmación y de retorno, que solo hacen falta para crear pagos.
 */
export function resolveFlowConfig(env: FlowEnvInput, scope: "api" | "full" = "full"): FlowConfig {
  const problems: string[] = [];

  const appEnvRaw = env.APP_ENV?.trim();
  const appEnv: AppEnv | undefined =
    appEnvRaw === "local" || appEnvRaw === "staging" || appEnvRaw === "production" ? appEnvRaw : undefined;
  if (!appEnv) problems.push("APP_ENV debe ser local, staging o production");

  const apiBase = env.FLOW_API_BASE ? stripSlash(env.FLOW_API_BASE) : "";
  if (!apiBase) problems.push("FLOW_API_BASE falta");
  else if (appEnv) {
    const expected = appEnv === "production" ? FLOW_PRODUCTION_BASE : FLOW_SANDBOX_BASE;
    if (apiBase !== expected) problems.push(`FLOW_API_BASE no corresponde a APP_ENV=${appEnv}`);
  }

  if (!env.FLOW_API_KEY) problems.push("FLOW_API_KEY falta");
  if (!env.FLOW_SECRET_KEY) problems.push("FLOW_SECRET_KEY falta");

  const confirmation = parseUrl(env.FLOW_CONFIRMATION_URL);
  const site = parseUrl(env.SITE_URL);
  if (scope === "full") {
    if (!confirmation) problems.push("FLOW_CONFIRMATION_URL falta o no es una URL");
    else if (confirmation.protocol !== "https:" && appEnv !== "local") problems.push("FLOW_CONFIRMATION_URL debe ser https");

    if (!site) problems.push("SITE_URL falta o no es una URL");
    else if (site.protocol !== "https:" && !(appEnv === "local" && site.protocol === "http:")) {
      problems.push("SITE_URL debe ser https");
    }
  }

  if (problems.length > 0 || !appEnv) throw new FlowConfigError(problems);
  return {
    appEnv,
    apiBase,
    apiKey: env.FLOW_API_KEY ?? "",
    secretKey: env.FLOW_SECRET_KEY ?? "",
    confirmationUrl: confirmation ? confirmation.toString() : "",
    siteUrl: site ? stripSlash(site.toString()) : "",
  };
}

/** `urlReturn` que Flow usa para redirigir al comprador (functions.md 3.3.1). El token va codificado. */
export function buildReturnUrl(siteUrl: string, orderNumber: string, accessToken: string): string {
  return `${siteUrl}/checkout/retorno?o=${encodeURIComponent(orderNumber)}&t=${encodeURIComponent(accessToken)}`;
}
