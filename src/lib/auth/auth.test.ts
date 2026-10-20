import { describe, expect, it, vi } from "vitest";
import { ensureAdmin } from "./admin-claim";
import { authErrorMessage, AUTH_NOT_ENABLED_MESSAGE, INVALID_CREDENTIALS_MESSAGE, isSilentResetError, NOT_ADMIN_MESSAGE } from "./messages";

const fbError = (code: string) => Object.assign(new Error(code), { code });

describe("mensajes de autenticación", () => {
  it("no revela si el correo existe", () => {
    expect(authErrorMessage(fbError("auth/user-not-found"))).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(authErrorMessage(fbError("auth/wrong-password"))).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(authErrorMessage(fbError("auth/invalid-credential"))).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(authErrorMessage(fbError("auth/user-disabled"))).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(isSilentResetError(fbError("auth/user-not-found"))).toBe(true);
    expect(isSilentResetError(fbError("auth/network-request-failed"))).toBe(false);
  });

  it("explica que el proveedor no está activado en el proyecto", () => {
    expect(authErrorMessage(fbError("auth/configuration-not-found"))).toBe(AUTH_NOT_ENABLED_MESSAGE);
    expect(authErrorMessage(fbError("auth/operation-not-allowed"))).toBe(AUTH_NOT_ENABLED_MESSAGE);
    expect(AUTH_NOT_ENABLED_MESSAGE).toMatch(/proveedor/);
  });

  it("usa un mensaje genérico para errores desconocidos", () => {
    expect(authErrorMessage(new Error("boom"))).toMatch(/Inténtalo de nuevo/);
    expect(authErrorMessage(null)).toMatch(/Inténtalo de nuevo/);
  });
});

describe("ensureAdmin (claimAdmin + refresco del token)", () => {
  it("si el token ya trae el claim no llama a claimAdmin", async () => {
    const claimAdmin = vi.fn();
    const result = await ensureAdmin({ hasAdminClaim: async () => true, claimAdmin });
    expect(result).toEqual({ ok: true });
    expect(claimAdmin).not.toHaveBeenCalled();
  });

  it("claimAdmin OK: refresca el token (getIdToken(true)) y verifica el claim", async () => {
    const reads: boolean[] = [];
    const result = await ensureAdmin({
      hasAdminClaim: async (refresh) => {
        reads.push(refresh);
        return refresh; // el claim solo aparece tras refrescar
      },
      claimAdmin: async () => ({ admin: true, alreadyAdmin: false }),
    });
    expect(result).toEqual({ ok: true });
    expect(reads).toEqual([false, true]);
  });

  it("alreadyAdmin también refresca", async () => {
    const result = await ensureAdmin({
      hasAdminClaim: async (refresh) => refresh,
      claimAdmin: async () => ({ admin: true, alreadyAdmin: true }),
    });
    expect(result.ok).toBe(true);
  });

  it("sin el claim tras refrescar: sin permisos", async () => {
    const result = await ensureAdmin({ hasAdminClaim: async () => false, claimAdmin: async () => ({ admin: true }) });
    expect(result).toEqual({ ok: false, reason: "not-admin", message: NOT_ADMIN_MESSAGE });
  });

  it("claimAdmin rechazado (correo fuera de ADMIN_EMAILS): sin permisos", async () => {
    const result = await ensureAdmin({
      hasAdminClaim: async () => false,
      claimAdmin: async () => {
        throw fbError("functions/permission-denied");
      },
    });
    expect(result).toEqual({ ok: false, reason: "not-admin", message: NOT_ADMIN_MESSAGE });
  });

  it("función no desplegada: error de disponibilidad, no de permisos", async () => {
    const result = await ensureAdmin({
      hasAdminClaim: async () => false,
      claimAdmin: async () => {
        throw fbError("functions/not-found");
      },
    });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
