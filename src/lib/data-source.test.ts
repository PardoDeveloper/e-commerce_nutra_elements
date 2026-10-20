import { describe, expect, it } from "vitest";
import { isDemoMode, resolveDataSource } from "./data-source";

describe("resolveDataSource", () => {
  it("en local: firebase solo si la variable vale firebase (con trim y minúsculas)", () => {
    expect(resolveDataSource({ DATA_SOURCE: "firebase" })).toBe("firebase");
    expect(resolveDataSource({ DATA_SOURCE: " Firebase " })).toBe("firebase");
    expect(resolveDataSource({ DATA_SOURCE: "FIREBASE" })).toBe("firebase");
  });

  it("en local: cualquier otro valor o ausencia es demo", () => {
    expect(resolveDataSource({})).toBe("demo");
    expect(resolveDataSource({ DATA_SOURCE: "" })).toBe("demo");
    expect(resolveDataSource({ DATA_SOURCE: "demo" })).toBe("demo");
    expect(resolveDataSource({ DATA_SOURCE: "firebase2" })).toBe("demo");
  });

  it("con K_SERVICE es siempre firebase, sin importar la variable", () => {
    for (const value of [undefined, "", "demo", "DEMO", "otra-cosa", "firebase"]) {
      expect(resolveDataSource({ K_SERVICE: "nutra", DATA_SOURCE: value })).toBe("firebase");
    }
  });

  it("con FIREBASE_CONFIG es siempre firebase, sin importar la variable", () => {
    for (const value of [undefined, "", "demo", "firebase"]) {
      expect(resolveDataSource({ FIREBASE_CONFIG: "{}", DATA_SOURCE: value })).toBe("firebase");
    }
  });

  it("con ambas variables de nube es firebase", () => {
    expect(resolveDataSource({ K_SERVICE: "x", FIREBASE_CONFIG: "{}", DATA_SOURCE: "demo" })).toBe("firebase");
  });

  it("lee process.env por defecto", () => {
    const saved = { k: process.env.K_SERVICE, f: process.env.FIREBASE_CONFIG, d: process.env.DATA_SOURCE };
    try {
      delete process.env.K_SERVICE;
      delete process.env.FIREBASE_CONFIG;
      process.env.DATA_SOURCE = "demo";
      expect(resolveDataSource()).toBe("demo");
      process.env.K_SERVICE = "x";
      expect(resolveDataSource()).toBe("firebase");
    } finally {
      for (const [key, value] of [["K_SERVICE", saved.k], ["FIREBASE_CONFIG", saved.f], ["DATA_SOURCE", saved.d]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("isDemoMode", () => {
  it("solo es true con demo", () => {
    expect(isDemoMode({})).toBe(true);
    expect(isDemoMode({ DATA_SOURCE: "demo" })).toBe(true);
    expect(isDemoMode({ DATA_SOURCE: "firebase" })).toBe(false);
    expect(isDemoMode({ K_SERVICE: "x", DATA_SOURCE: "demo" })).toBe(false);
  });
});
