import { describe, expect, it, vi } from "vitest";
import { claimAdminCore, grantAdminCore, revokeAdminCore, type AdminAuthLike, type UserRecordLike } from "./claims.js";
import { isAllowedAdminEmail, maskEmail, parseAdminEmails } from "./emails.js";

function fakeAuth(users: UserRecordLike[]) {
  const auth = {
    getUser: vi.fn(async (uid: string) => {
      const u = users.find((x) => x.uid === uid);
      if (!u) throw { code: "auth/user-not-found" };
      return u;
    }),
    getUserByEmail: vi.fn(async (email: string) => {
      const u = users.find((x) => x.email === email);
      if (!u) throw { code: "auth/user-not-found" };
      return u;
    }),
    setCustomUserClaims: vi.fn(async (_uid: string, _claims: Record<string, unknown> | null) => undefined),
    revokeRefreshTokens: vi.fn(async (_uid: string) => undefined),
  };
  return auth satisfies AdminAuthLike;
}

const allowed = parseAdminEmails(" Carlos@Gmail.com , otro@x.cl,, ");

describe("emails", () => {
  it("normaliza la lista", () => {
    expect([...allowed].sort()).toEqual(["carlos@gmail.com", "otro@x.cl"]);
    expect(parseAdminEmails("").size).toBe(0);
    expect(parseAdminEmails(undefined).size).toBe(0);
  });
  it("compara sin mayúsculas ni espacios y falla cerrado", () => {
    expect(isAllowedAdminEmail("  CARLOS@gmail.COM ", allowed)).toBe(true);
    expect(isAllowedAdminEmail("x@gmail.com", allowed)).toBe(false);
    expect(isAllowedAdminEmail(undefined, allowed)).toBe(false);
    expect(isAllowedAdminEmail("a@b.cl", new Set())).toBe(false);
  });
  it("enmascara", () => {
    expect(maskEmail("carlos@gmail.com")).toBe("c***@gmail.com");
    expect(maskEmail(undefined)).toBe("(sin correo)");
  });
});

describe("claimAdminCore", () => {
  it("asigna el claim si el correo está en la lista y verificado", async () => {
    const auth = fakeAuth([{ uid: "u1", email: "carlos@gmail.com", customClaims: { foo: 1 } }]);
    const res = await claimAdminCore(auth, { uid: "u1", token: { email: "Carlos@gmail.com", email_verified: true } }, allowed);
    expect(res).toEqual({ admin: true, alreadyAdmin: false });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u1", { foo: 1, admin: true });
  });
  it("responde alreadyAdmin sin escribir", async () => {
    const auth = fakeAuth([]);
    const res = await claimAdminCore(auth, { uid: "u1", token: { admin: true } }, allowed);
    expect(res).toEqual({ admin: true, alreadyAdmin: true });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
  it("alreadyAdmin si el registro ya tiene el claim aunque el token esté viejo", async () => {
    const auth = fakeAuth([{ uid: "u1", email: "carlos@gmail.com", customClaims: { admin: true } }]);
    const res = await claimAdminCore(auth, { uid: "u1", token: { email: "carlos@gmail.com", email_verified: true } }, allowed);
    expect(res.alreadyAdmin).toBe(true);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
  it.each([
    ["correo fuera de la lista", { email: "intruso@gmail.com", email_verified: true }],
    ["correo sin verificar", { email: "carlos@gmail.com", email_verified: false }],
    ["email_verified ausente", { email: "carlos@gmail.com" }],
    ["email_verified no booleano", { email: "carlos@gmail.com", email_verified: "true" }],
    ["sin correo", { email_verified: true }],
    ["admin no estrictamente true", { admin: "true", email: "intruso@gmail.com", email_verified: true }],
  ])("rechaza con NOT_ALLOWED: %s", async (_name, token) => {
    const auth = fakeAuth([{ uid: "u1", email: "x" }]);
    await expect(claimAdminCore(auth, { uid: "u1", token }, allowed)).rejects.toMatchObject({
      code: "permission-denied",
      details: { code: "NOT_ALLOWED" },
    });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
  it("lista vacía no autoriza a nadie", async () => {
    const auth = fakeAuth([]);
    await expect(
      claimAdminCore(auth, { uid: "u1", token: { email: "carlos@gmail.com", email_verified: true } }, new Set()),
    ).rejects.toMatchObject({ details: { code: "NOT_ALLOWED" } });
  });
  it("el error no revela la lista", async () => {
    const auth = fakeAuth([]);
    const err = await claimAdminCore(auth, { uid: "u1", token: { email: "z@z.cl", email_verified: true } }, allowed).catch(
      (e: unknown) => e,
    );
    expect(JSON.stringify(err)).not.toContain("carlos@gmail.com");
  });
});

describe("grantAdminCore / revokeAdminCore", () => {
  it("grant asigna y es idempotente", async () => {
    const auth = fakeAuth([
      { uid: "u2", email: "b@x.cl" },
      { uid: "u3", email: "c@x.cl", customClaims: { admin: true } },
    ]);
    expect(await grantAdminCore(auth, "u1", { email: " B@x.cl " })).toEqual({ uid: "u2", admin: true });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u2", { admin: true });
    auth.setCustomUserClaims.mockClear();
    expect(await grantAdminCore(auth, "u1", { email: "c@x.cl" })).toEqual({ uid: "u3", admin: true });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
  it("grant: USER_NOT_FOUND y entrada inválida", async () => {
    const auth = fakeAuth([]);
    await expect(grantAdminCore(auth, "u1", { email: "no@x.cl" })).rejects.toMatchObject({
      code: "not-found",
      details: { code: "USER_NOT_FOUND" },
    });
    await expect(grantAdminCore(auth, "u1", { email: "malo" })).rejects.toMatchObject({ details: { code: "INVALID_INPUT" } });
    await expect(grantAdminCore(auth, "u1", { email: "a@x.cl", extra: 1 })).rejects.toMatchObject({
      details: { code: "INVALID_INPUT" },
    });
  });
  it("revoke quita el claim, conserva otros y revoca tokens; es idempotente", async () => {
    const auth = fakeAuth([
      { uid: "u2", email: "b@x.cl", customClaims: { admin: true, foo: 1 } },
      { uid: "u3", email: "c@x.cl", customClaims: { admin: true } },
      { uid: "u4", email: "d@x.cl" },
    ]);
    expect(await revokeAdminCore(auth, "u1", { email: "b@x.cl" })).toEqual({ uid: "u2", admin: false });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u2", { foo: 1 });
    await revokeAdminCore(auth, "u1", { email: "c@x.cl" });
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("u3", null);
    auth.setCustomUserClaims.mockClear();
    auth.revokeRefreshTokens.mockClear();
    await revokeAdminCore(auth, "u1", { email: "d@x.cl" });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  it("revoke sobre uno mismo falla", async () => {
    const auth = fakeAuth([{ uid: "u1", email: "a@x.cl", customClaims: { admin: true } }]);
    await expect(revokeAdminCore(auth, "u1", { email: "a@x.cl" })).rejects.toMatchObject({
      code: "failed-precondition",
      details: { code: "CANNOT_REVOKE_SELF" },
    });
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  });
});
