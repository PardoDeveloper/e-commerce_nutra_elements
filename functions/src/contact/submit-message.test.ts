import { describe, expect, it, vi } from "vitest";
import { getAppErrorCode } from "../common/errors.js";
import { MemoryDb } from "../common/testing/memory-db.js";
import { CONTACT_PER_IP_PER_10_MIN, handleSubmitContactMessage } from "./submit-message.js";

vi.mock("firebase-functions/logger", () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined }));

const T0 = new Date("2026-10-26T15:00:00Z");
const IP = "203.0.113.9";
const VALID = { name: "Ana Pérez", email: " Ana@Correo.CL ", phone: "+56 9 1234 5678", message: "Hola, ¿tienen stock de magnesio?" };

function env() {
  const db = new MemoryDb();
  return { db, deps: { db, clock: () => T0 } };
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return getAppErrorCode(err);
  }
}

describe("handleSubmitContactMessage", () => {
  it("guarda el mensaje normalizado, sin leer ni archivar", async () => {
    const { db, deps } = env();
    await expect(handleSubmitContactMessage(deps, VALID, { ip: IP })).resolves.toEqual({ ok: true });
    const [path] = db.paths("contactMessages/");
    expect(path).toMatch(/^contactMessages\/[A-Za-z0-9_-]{20}$/);
    expect(db.peek(path!)).toEqual({
      name: "Ana Pérez",
      email: "ana@correo.cl",
      phone: "+56912345678",
      message: "Hola, ¿tienen stock de magnesio?",
      read: false,
      archived: false,
      createdAt: T0,
      updatedAt: T0,
    });
  });

  it("el teléfono es opcional", async () => {
    const { db, deps } = env();
    await handleSubmitContactMessage(deps, { ...VALID, phone: "" });
    await handleSubmitContactMessage(deps, { name: VALID.name, email: VALID.email, message: VALID.message });
    const saved = db.paths("contactMessages/").map((p) => db.peek(p)?.["phone"]);
    expect(saved).toEqual([null, null]);
  });

  it.each([
    ["nombre corto", { ...VALID, name: "A" }],
    ["correo inválido", { ...VALID, email: "no-es-correo" }],
    ["teléfono inválido", { ...VALID, phone: "12ab" }],
    ["mensaje corto", { ...VALID, message: "hola" }],
    ["mensaje largo", { ...VALID, message: "x".repeat(2001) }],
    ["campo extra", { ...VALID, admin: true }],
  ])("rechaza %s", async (_label, data) => {
    const { db, deps } = env();
    expect(await codeOf(handleSubmitContactMessage(deps, data))).toBe("INVALID_INPUT");
    expect(db.paths("contactMessages/")).toEqual([]);
  });

  it("la trampa para bots responde ok sin guardar", async () => {
    const { db, deps } = env();
    await expect(handleSubmitContactMessage(deps, { ...VALID, website: "http://spam" }, { ip: IP })).resolves.toEqual({ ok: true });
    expect(db.paths("contactMessages/")).toEqual([]);
  });

  it("limita los envíos por IP", async () => {
    const { db, deps } = env();
    for (let i = 0; i < CONTACT_PER_IP_PER_10_MIN; i++) await handleSubmitContactMessage(deps, VALID, { ip: IP });
    expect(await codeOf(handleSubmitContactMessage(deps, VALID, { ip: IP }))).toBe("RATE_LIMITED");
    expect(db.paths("contactMessages/")).toHaveLength(CONTACT_PER_IP_PER_10_MIN);
  });
});
