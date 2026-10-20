import { describe, expect, it, vi } from "vitest";

// La capa de datos es solo de servidor (importa "server-only"): aquí solo se prueba demoThreshold.
vi.mock("@/lib/data", () => ({ getProducts: vi.fn(), getPublicSettings: vi.fn() }));

import { demoThreshold } from "./server";

describe("demoThreshold (DEMO_FREE_SHIPPING_THRESHOLD)", () => {
  it("en demo aplica el umbral si es un entero positivo", () => {
    expect(demoThreshold(null, { DATA_SOURCE: "demo", DEMO_FREE_SHIPPING_THRESHOLD: "30000" })).toBe(30000);
    expect(demoThreshold(null, { DEMO_FREE_SHIPPING_THRESHOLD: "30000" })).toBe(30000);
  });

  it("en demo ignora valores inválidos", () => {
    for (const raw of ["", "0", "-5", "abc", "1.5"]) {
      expect(demoThreshold(20000, { DEMO_FREE_SHIPPING_THRESHOLD: raw })).toBe(20000);
    }
  });

  it("con firebase se ignora", () => {
    expect(demoThreshold(null, { DATA_SOURCE: "firebase", DEMO_FREE_SHIPPING_THRESHOLD: "30000" })).toBeNull();
    expect(demoThreshold(15000, { DATA_SOURCE: "firebase", DEMO_FREE_SHIPPING_THRESHOLD: "30000" })).toBe(15000);
  });

  it("en la nube se ignora aunque DATA_SOURCE=demo", () => {
    expect(demoThreshold(null, { K_SERVICE: "x", DATA_SOURCE: "demo", DEMO_FREE_SHIPPING_THRESHOLD: "30000" })).toBeNull();
    expect(demoThreshold(null, { FIREBASE_CONFIG: "{}", DEMO_FREE_SHIPPING_THRESHOLD: "30000" })).toBeNull();
  });
});
