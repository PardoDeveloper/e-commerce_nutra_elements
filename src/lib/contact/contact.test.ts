import { describe, expect, it } from "vitest";
import { addDemoMessage, DEMO_MESSAGES_KEY, readDemoMessages, type KeyValueStorage } from "./demo-store";
import { validateContact } from "./validation";

const VALID = { name: "  Ana Pérez ", email: "Ana@Correo.CL", phone: "", message: "Hola, ¿tienen stock de magnesio?" };

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("validateContact", () => {
  it("acepta y normaliza", () => {
    expect(validateContact({ ...VALID, phone: "+56 9 1234 5678" })).toEqual({
      ok: true,
      request: { name: "Ana Pérez", email: "ana@correo.cl", phone: "+56912345678", message: VALID.message },
    });
  });

  it("el teléfono es opcional", () => {
    const r = validateContact(VALID);
    expect(r.ok && r.request.phone).toBe("");
  });

  it("marca cada campo inválido", () => {
    const r = validateContact({ name: "", email: "mal", phone: "12ab", message: "corto" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "message", "name", "phone"]);
  });
});

describe("demo-store", () => {
  it("agrega el más reciente primero, sin leer ni archivar", () => {
    const storage = memoryStorage();
    addDemoMessage(storage, { name: "A", email: "a@b.cl", phone: "", message: "uno uno uno" }, new Date("2026-10-01T10:00:00Z"));
    addDemoMessage(storage, { name: "B", email: "b@b.cl", phone: "+56912345678", message: "dos dos dos" }, new Date("2026-10-02T10:00:00Z"));
    const all = readDemoMessages(storage);
    expect(all.map((m) => m.name)).toEqual(["B", "A"]);
    expect(all[0]).toMatchObject({ phone: "+56912345678", read: false, archived: false, createdAt: "2026-10-02T10:00:00.000Z" });
    expect(all[1]?.phone).toBeNull();
  });

  it("ignora datos corruptos", () => {
    expect(readDemoMessages(memoryStorage({ [DEMO_MESSAGES_KEY]: "{no json" }))).toEqual([]);
    expect(readDemoMessages(memoryStorage({ [DEMO_MESSAGES_KEY]: JSON.stringify([{ id: 1 }]) }))).toEqual([]);
  });
});
