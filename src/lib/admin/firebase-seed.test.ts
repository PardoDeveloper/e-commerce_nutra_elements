import { describe, expect, it } from "vitest";
import { TEST_BANK_HOLDER_RUT, isTestBank } from "@/lib/bank";
import { buildInitialCategories, buildInitialPrivateSettings, buildInitialPublicSettings } from "./firebase-seed";

const isStr = (v: unknown, min: number, max: number) => typeof v === "string" && v.length >= min && v.length <= max;
const isInt = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

describe("ajustes iniciales (espejo de validPublicSettings)", () => {
  const d = buildInitialPublicSettings();
  it("tiene exactamente las claves y valores válidos", () => {
    expect(Object.keys(d).sort()).toEqual(["communes", "freeShippingThreshold", "maxQtyPerItem", "pickup", "shippingFee"]);
    expect(d.shippingFee).toBe(3990);
    expect(d.freeShippingThreshold).toBeNull();
    expect(isInt(d.maxQtyPerItem, 1, 100)).toBe(true);
    const communes = d.communes as { code: string; name: string }[];
    expect(communes.length).toBe(52);
    const pickup = d.pickup as Record<string, unknown>;
    expect(Object.keys(pickup).sort()).toEqual(["address", "enabled", "hours"]);
    expect(isStr(pickup.address, 0, 200) && isStr(pickup.hours, 0, 200) && typeof pickup.enabled === "boolean").toBe(true);
  });
});

describe("ajustes privados iniciales (espejo de validPrivateSettings)", () => {
  const d = buildInitialPrivateSettings();
  it("tiene exactamente las claves y valores válidos", () => {
    expect(Object.keys(d).sort()).toEqual(["bank", "limits", "orderNumberStart", "reservationMinutes"]);
    const r = d.reservationMinutes as Record<string, unknown>;
    expect(isInt(r.flow, 5, 240) && isInt(r.transfer, 60, 10080)).toBe(true);
    const bank = d.bank as Record<string, unknown>;
    for (const key of ["bankName", "accountType", "accountNumber", "holderName", "holderRut"]) expect(isStr(bank[key], 1, 100), key).toBe(true);
    expect(bank.holderRut).toBe(TEST_BANK_HOLDER_RUT);
    expect(bank.holderRut).not.toMatch(/\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]/);
    expect(isTestBank(bank as { bankName: string })).toBe(true);
    expect(d.orderNumberStart).toBe(1);
    const l = d.limits as Record<string, number>;
    expect(isInt(l.createOrderPerIpPer10Min, 1, 100) && isInt(l.pendingOrdersPerEmail, 1, 50)).toBe(true);
    expect(l.orderStatusPerIpPer10Min).toBe(120);
    expect(l).not.toHaveProperty("flowConfirmPerIpPer10Min");
    expect(isInt(l.orderStatusPerIpPer10Min, 1, 1000) &&isInt(l.orderStatusFailuresPerOrder, 1, 100)).toBe(true);
  });
});

describe("categorías iniciales (espejo de validCategory)", () => {
  const cats = buildInitialCategories();
  it("son las 6 de D-023 con slug = ID y solo claves permitidas", () => {
    expect(cats.map((c) => c.id)).toEqual(["vitaminas", "magnesio", "minerales", "omega-3", "belleza", "bienestar"]);
    for (const c of cats) {
      expect(c.data.slug).toBe(c.id);
      expect(c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(isStr(c.data.name, 1, 80)).toBe(true);
      expect(isInt(c.data.order, 0, 9999)).toBe(true);
      expect(c.data.published).toBe(true);
      expect(Object.keys(c.data).sort()).toEqual(["name", "order", "published", "slug"]);
    }
  });
});
