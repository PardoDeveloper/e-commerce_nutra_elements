import { describe, expect, it } from "vitest";
import { buildSeedData, communeCode } from "./seed.js";

describe("communeCode", () => {
  it("quita tildes y eñes", () => {
    expect(communeCode("Ñuñoa")).toBe("nunoa");
    expect(communeCode("Maipú")).toBe("maipu");
    expect(communeCode("Peñalolén")).toBe("penalolen");
    expect(communeCode("San José de Maipo")).toBe("san-jose-de-maipo");
  });
});

describe("buildSeedData", () => {
  const data = buildSeedData();

  it("trae las 6 categorías de D-023 con slug válido y orden creciente", () => {
    expect(data.categories.map((c) => c.slug)).toEqual(["vitaminas", "magnesio", "minerales", "omega-3", "belleza", "bienestar"]);
    for (const c of data.categories) {
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.name.length).toBeLessThanOrEqual(80);
      expect((c.description ?? "").length).toBeLessThanOrEqual(2000);
      expect(c.published).toBe(true);
    }
    const orders = data.categories.map((c) => c.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("no atribuye propiedades de curar, tratar o prevenir", () => {
    for (const c of data.categories) expect(c.description ?? "").not.toMatch(/cura|trata|previene|enfermedad/i);
  });

  it("settings/public respeta el contrato", () => {
    const s = data.settingsPublic;
    expect(s.shippingFee).toBe(3990);
    expect(s.freeShippingThreshold).toBeNull();
    expect(s.communes).toHaveLength(52);
    expect(new Set(s.communes.map((c) => c.code)).size).toBe(52);
    expect(s.communes.map((c) => c.code)).toContain("puente-alto");
    expect(s.pickup.address.length).toBeLessThanOrEqual(200);
    expect(s.maxQtyPerItem).toBe(10);
  });

  it("settings/private respeta rangos del contrato y marca banco de prueba", () => {
    const p = data.settingsPrivate;
    expect(p.reservationMinutes.flow).toBeGreaterThanOrEqual(5);
    expect(p.reservationMinutes.transfer).toBeGreaterThanOrEqual(60);
    expect(p.orderNumberStart).toBe(1);
    expect(p.bank.bankName).toContain("PRUEBA");
    expect(Object.keys(p.limits)).toHaveLength(4);
  });

  it("devuelve copias independientes", () => {
    const a = buildSeedData();
    a.categories[0]!.name = "X";
    expect(buildSeedData().categories[0]!.name).toBe("Vitaminas");
  });
});
