import { describe, expect, it } from "vitest";
import { getAppErrorCode } from "./errors.js";
import { assertAdmin, assertAppCheck, assertAuthenticated, callableSecurityOptions, isAppCheckEnforced } from "./auth.js";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return getAppErrorCode(e);
  }
  return undefined;
}

describe("assertAuthenticated", () => {
  it("devuelve el uid con sesión", () => {
    expect(assertAuthenticated({ auth: { uid: "u1", token: {} } })).toBe("u1");
  });
  it("sin sesión lanza UNAUTHENTICATED", () => {
    expect(codeOf(() => assertAuthenticated({}))).toBe("UNAUTHENTICATED");
    expect(codeOf(() => assertAuthenticated({ auth: null }))).toBe("UNAUTHENTICATED");
    expect(codeOf(() => assertAuthenticated({ auth: { uid: "" } }))).toBe("UNAUTHENTICATED");
  });
});

describe("assertAdmin", () => {
  it("acepta admin === true", () => {
    expect(assertAdmin({ auth: { uid: "a1", token: { admin: true } } })).toBe("a1");
  });
  it("sin sesión: UNAUTHENTICATED", () => {
    expect(codeOf(() => assertAdmin({}))).toBe("UNAUTHENTICATED");
  });
  it("sesión sin claim: NOT_ADMIN", () => {
    expect(codeOf(() => assertAdmin({ auth: { uid: "u", token: {} } }))).toBe("NOT_ADMIN");
    expect(codeOf(() => assertAdmin({ auth: { uid: "u" } }))).toBe("NOT_ADMIN");
  });
  it("valores que no son el booleano true no cuentan", () => {
    for (const admin of [false, "true", 1, null, {}]) {
      expect(codeOf(() => assertAdmin({ auth: { uid: "u", token: { admin } } }))).toBe("NOT_ADMIN");
    }
  });
});

describe("App Check", () => {
  it("falla cerrado: solo APP_ENV=local lo desactiva", () => {
    expect(isAppCheckEnforced("local")).toBe(false);
    expect(isAppCheckEnforced("staging")).toBe(true);
    expect(isAppCheckEnforced("production")).toBe(true);
    expect(isAppCheckEnforced("")).toBe(true);
    expect(isAppCheckEnforced(undefined) === (process.env["APP_ENV"] !== "local")).toBe(true);
  });
  it("callableSecurityOptions refleja el ambiente", () => {
    expect(callableSecurityOptions("production")).toEqual({ enforceAppCheck: true });
    expect(callableSecurityOptions("local")).toEqual({ enforceAppCheck: false });
  });
  it("assertAppCheck exige request.app cuando se aplica", () => {
    expect(codeOf(() => assertAppCheck({}, "production"))).toBe("APP_CHECK_FAILED");
    expect(codeOf(() => assertAppCheck({ app: { appId: "x" } }, "production"))).toBeUndefined();
    expect(codeOf(() => assertAppCheck({}, "local"))).toBeUndefined();
  });
});
