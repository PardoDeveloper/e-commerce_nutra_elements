import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { invalidInputFromZod } from "../common/errors.js";
import { adminError } from "./errors.js";
import { isAllowedAdminEmail, maskEmail, normalizeEmail } from "./emails.js";

// Lógica de los claims de administrador, separada de los callables para probarla sin emulador.

export interface UserRecordLike {
  uid: string;
  email?: string | undefined;
  customClaims?: Record<string, unknown> | undefined;
}

/** Subconjunto de `firebase-admin/auth` que usamos. */
export interface AdminAuthLike {
  getUser(uid: string): Promise<UserRecordLike>;
  getUserByEmail(email: string): Promise<UserRecordLike>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown> | null): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

const emailRequestSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});

export interface AdminClaimResponse {
  uid: string;
  admin: boolean;
}

export interface ClaimAdminResponse {
  admin: true;
  alreadyAdmin: boolean;
}

function isUserNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "auth/user-not-found";
}

/**
 * Bootstrap del primer admin (D-031). Asigna `admin: true` solo si el correo del token está en la lista
 * y está verificado. Si no, `permission-denied` / `NOT_ALLOWED` sin revelar la lista.
 */
export async function claimAdminCore(
  auth: AdminAuthLike,
  caller: { uid: string; token: { email?: unknown; email_verified?: unknown; admin?: unknown } },
  allowedEmails: ReadonlySet<string>,
): Promise<ClaimAdminResponse> {
  const { uid, token } = caller;

  // Ya es admin (claim en el token): no se toca nada.
  if (token.admin === true) {
    logger.info("claimAdmin: ya era admin", { uid, result: "already_admin" });
    return { admin: true, alreadyAdmin: true };
  }

  // email_verified debe ser exactamente `true`; un correo sin verificar no se acepta aunque esté en la lista.
  const allowed = token.email_verified === true && isAllowedAdminEmail(token.email, allowedEmails);
  if (!allowed) {
    logger.warn("claimAdmin: rechazado", { uid, email: maskEmail(token.email), result: "not_allowed" });
    throw adminError("NOT_ALLOWED");
  }

  // El registro de Auth es la fuente de verdad de los claims (el token puede estar desactualizado).
  const user = await auth.getUser(uid);
  const claims = user.customClaims ?? {};
  if (claims["admin"] === true) {
    logger.info("claimAdmin: ya era admin", { uid, result: "already_admin" });
    return { admin: true, alreadyAdmin: true };
  }

  await auth.setCustomUserClaims(uid, { ...claims, admin: true });
  logger.info("claimAdmin: claim asignado", { uid, email: maskEmail(token.email), result: "granted" });
  return { admin: true, alreadyAdmin: false };
}

function parseEmailRequest(data: unknown): string {
  const result = emailRequestSchema.safeParse(data);
  if (!result.success) throw invalidInputFromZod(result.error);
  return normalizeEmail(result.data.email);
}

async function findUserByEmail(auth: AdminAuthLike, email: string): Promise<UserRecordLike> {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (isUserNotFound(err)) throw adminError("USER_NOT_FOUND");
    throw err;
  }
}

/** `grantAdmin` (5.8): idempotente. El llamador ya pasó `assertAdmin`. */
export async function grantAdminCore(auth: AdminAuthLike, callerUid: string, data: unknown): Promise<AdminClaimResponse> {
  const email = parseEmailRequest(data);
  const user = await findUserByEmail(auth, email);
  const claims = user.customClaims ?? {};
  if (claims["admin"] !== true) {
    await auth.setCustomUserClaims(user.uid, { ...claims, admin: true });
  }
  logger.info("grantAdmin", { by: callerUid, target: user.uid, email: maskEmail(email) });
  return { uid: user.uid, admin: true };
}

/**
 * `revokeAdmin` (5.8): idempotente. No permite quitarse el rol a uno mismo; como quien llama es admin y
 * el destino es otro usuario, siempre queda al menos un admin (quien llama).
 */
export async function revokeAdminCore(auth: AdminAuthLike, callerUid: string, data: unknown): Promise<AdminClaimResponse> {
  const email = parseEmailRequest(data);
  const user = await findUserByEmail(auth, email);
  if (user.uid === callerUid) throw adminError("CANNOT_REVOKE_SELF");

  const claims = { ...(user.customClaims ?? {}) };
  if (claims["admin"] === true) {
    delete claims["admin"];
    await auth.setCustomUserClaims(user.uid, Object.keys(claims).length > 0 ? claims : null);
    // Invalida los refresh tokens: el usuario deberá iniciar sesión de nuevo y perderá el claim.
    await auth.revokeRefreshTokens(user.uid);
  }
  logger.info("revokeAdmin", { by: callerUid, target: user.uid, email: maskEmail(email) });
  return { uid: user.uid, admin: false };
}
