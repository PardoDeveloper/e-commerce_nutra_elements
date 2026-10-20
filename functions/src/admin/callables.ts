import { onCall } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { assertAdmin, assertAuthenticated, callableSecurityOptions } from "../common/auth.js";
import { toHttpsError } from "../common/errors.js";
import { parseAdminEmails } from "./emails.js";
import {
  claimAdminCore,
  grantAdminCore,
  revokeAdminCore,
  type AdminAuthLike,
  type AdminClaimResponse,
  type ClaimAdminResponse,
} from "./claims.js";

if (getApps().length === 0) initializeApp();

// Lista de correos que pueden autoasignarse admin (D-031). No es secreto. Vacía por defecto:
// vacía = nadie puede reclamar el rol (falla cerrado). Formato: correos separados por comas.
const adminEmails = defineString("ADMIN_EMAILS", { default: "" });

const options = () => ({
  ...callableSecurityOptions(),
  memory: "256MiB" as const,
  timeoutSeconds: 30,
  maxInstances: 2,
});

/**
 * `claimAdmin` (bootstrap, D-031). Sin datos de entrada. Requiere sesión.
 * El cliente DEBE refrescar el token después: `await user.getIdToken(true)`.
 */
export const claimAdmin = onCall<unknown, Promise<ClaimAdminResponse>>(options(), async (request) => {
  try {
    const uid = assertAuthenticated(request);
    return await claimAdminCore(
      getAuth() as unknown as AdminAuthLike,
      { uid, token: request.auth?.token ?? {} },
      parseAdminEmails(adminEmails.value()),
    );
  } catch (err) {
    throw toHttpsError(err);
  }
});

/** `grantAdmin` (5.8): solo admin. Entrada `{ email }`. El destinatario debe refrescar su token. */
export const grantAdmin = onCall<unknown, Promise<AdminClaimResponse>>(options(), async (request) => {
  try {
    const uid = assertAdmin(request);
    return await grantAdminCore(getAuth() as unknown as AdminAuthLike, uid, request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
});

/** `revokeAdmin` (5.8): solo admin. Entrada `{ email }`. No sobre uno mismo. */
export const revokeAdmin = onCall<unknown, Promise<AdminClaimResponse>>(options(), async (request) => {
  try {
    const uid = assertAdmin(request);
    return await revokeAdminCore(getAuth() as unknown as AdminAuthLike, uid, request.data);
  } catch (err) {
    throw toHttpsError(err);
  }
});
