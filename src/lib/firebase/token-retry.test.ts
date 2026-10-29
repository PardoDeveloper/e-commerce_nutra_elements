import { describe, expect, it, vi } from "vitest";
import { isTokenRejection, withTokenRetry } from "./token-retry";

const sdkRejection = () => Object.assign(new Error("Unauthenticated"), { code: "functions/unauthenticated" });

describe("isTokenRejection", () => {
  it("solo cuenta el unauthenticated del SDK, sin código de aplicación", () => {
    expect(isTokenRejection(sdkRejection())).toBe(true);
    expect(isTokenRejection({ code: "functions/unauthenticated", details: { code: "UNAUTHENTICATED" } })).toBe(false);
    expect(isTokenRejection({ code: "functions/permission-denied" })).toBe(false);
    expect(isTokenRejection(new Error("x"))).toBe(false);
    expect(isTokenRejection(null)).toBe(false);
  });
});

describe("withTokenRetry", () => {
  it("renueva los tokens y reintenta una vez cuando el SDK rechaza el token", async () => {
    const call = vi.fn().mockRejectedValueOnce(sdkRejection()).mockResolvedValueOnce("ok");
    const refresh = vi.fn(async () => undefined);
    await expect(withTokenRetry(call, refresh)).resolves.toBe("ok");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("no reintenta más de una vez", async () => {
    const call = vi.fn().mockRejectedValue(sdkRejection());
    await expect(withTokenRetry(call, async () => undefined)).rejects.toMatchObject({ code: "functions/unauthenticated" });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("no reintenta otros errores y devuelve el original si la renovación falla", async () => {
    const other = { code: "functions/invalid-argument" };
    const call = vi.fn().mockRejectedValue(other);
    const refresh = vi.fn(async () => undefined);
    await expect(withTokenRetry(call, refresh)).rejects.toBe(other);
    expect(refresh).not.toHaveBeenCalled();

    const rejection = sdkRejection();
    const failing = vi.fn().mockRejectedValue(rejection);
    await expect(withTokenRetry(failing, async () => Promise.reject(new Error("sin red")))).rejects.toBe(rejection);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
