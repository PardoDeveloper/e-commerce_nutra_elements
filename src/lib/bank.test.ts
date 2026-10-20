import { describe, expect, it } from "vitest";
import { TEST_BANK_NAME, isTestBank, isTransferOffered } from "./bank";

describe("isTestBank", () => {
  it("detecta el banco sembrado", () => {
    expect(isTestBank({ bankName: TEST_BANK_NAME })).toBe(true);
    expect(isTestBank({ bankName: " banco de prueba " })).toBe(true);
  });
  it("no marca bancos reales ni vacíos", () => {
    expect(isTestBank({ bankName: "Banco Estado" })).toBe(false);
    expect(isTestBank({ bankName: "" })).toBe(false);
    expect(isTestBank(null)).toBe(false);
  });
});

describe("isTransferOffered", () => {
  it("en demo siempre se ofrece", () => {
    expect(isTransferOffered("demo", null)).toBe(true);
    expect(isTransferOffered("demo", { bankName: TEST_BANK_NAME })).toBe(true);
  });
  it("con firebase no se ofrece sin datos ni con banco de prueba", () => {
    expect(isTransferOffered("firebase", null)).toBe(false);
    expect(isTransferOffered("firebase", { bankName: "" })).toBe(false);
    expect(isTransferOffered("firebase", { bankName: TEST_BANK_NAME })).toBe(false);
  });
  it("con firebase y banco real se ofrece", () => {
    expect(isTransferOffered("firebase", { bankName: "Banco Estado" })).toBe(true);
  });
});
