import { describe, expect, it } from "vitest";
import type { ContactMessage } from "@/lib/contact/types";
import { countMessages, DEFAULT_MESSAGE_FILTERS, filterMessages, toContactMessage } from "./messages";

const msg = (id: string, createdAt: string, over: Partial<ContactMessage> = {}): ContactMessage => ({
  id,
  name: `Cliente ${id}`,
  email: `${id}@correo.cl`,
  phone: null,
  message: "Consulta general",
  read: false,
  archived: false,
  createdAt,
  ...over,
});

// 02:00 UTC del 10-oct es aún 09-oct en Santiago (UTC-3 en octubre).
const ALL = [
  msg("a", "2026-10-10T02:00:00Z"),
  msg("b", "2026-10-12T15:00:00Z", { read: true, name: "José Muñoz", message: "¿Despachan a Maipú?" }),
  msg("c", "2026-10-15T15:00:00Z", { archived: true }),
  msg("d", "2026-10-20T15:00:00Z"),
];

const ids = (list: ContactMessage[]) => list.map((m) => m.id);

describe("filterMessages", () => {
  it("bandeja de entrada: sin archivados, del más reciente al más antiguo", () => {
    expect(ids(filterMessages(ALL, DEFAULT_MESSAGE_FILTERS))).toEqual(["d", "b", "a"]);
  });

  it("archivados", () => {
    expect(ids(filterMessages(ALL, { ...DEFAULT_MESSAGE_FILTERS, folder: "archived" }))).toEqual(["c"]);
  });

  it("leídos y no leídos", () => {
    expect(ids(filterMessages(ALL, { ...DEFAULT_MESSAGE_FILTERS, read: "read" }))).toEqual(["b"]);
    expect(ids(filterMessages(ALL, { ...DEFAULT_MESSAGE_FILTERS, read: "unread" }))).toEqual(["d", "a"]);
  });

  it("rango de fechas inclusivo en hora de Chile, y corrige un rango invertido", () => {
    expect(ids(filterMessages(ALL, { ...DEFAULT_MESSAGE_FILTERS, from: "2026-10-10", to: "2026-10-20" }))).toEqual(["d", "b"]);
    expect(ids(filterMessages(ALL, { ...DEFAULT_MESSAGE_FILTERS, from: "2026-10-09", to: "2026-10-09" }))).toEqual(["a"]);
    expect(ids(filterMessages(ALL, { ...DEFAULT_MESSAGE_FILTERS, from: "2026-10-20", to: "2026-10-10" }))).toEqual(["d", "b"]);
    expect(ids(filterMessages(ALL, { ...DEFAULT_MESSAGE_FILTERS, from: "2026-10-13" }))).toEqual(["d"]);
  });

  it("busca sin tildes en nombre, correo y mensaje", () => {
    expect(ids(filterMessages(ALL, { ...DEFAULT_MESSAGE_FILTERS, query: "jose munoz" }))).toEqual(["b"]);
    expect(ids(filterMessages(ALL, { ...DEFAULT_MESSAGE_FILTERS, query: "MAIPU" }))).toEqual(["b"]);
  });
});

describe("countMessages", () => {
  it("cuenta bandeja, no leídos (sin archivados) y archivados", () => {
    expect(countMessages(ALL)).toEqual({ inbox: 3, unread: 2, archived: 1 });
  });
});

describe("toContactMessage", () => {
  it("convierte un documento y descarta los inválidos", () => {
    const at = { toDate: () => new Date("2026-10-01T12:00:00Z") };
    expect(toContactMessage("x", { name: "A", email: "a@b.cl", phone: null, message: "hola hola", read: true, archived: false, createdAt: at })).toEqual({
      id: "x",
      name: "A",
      email: "a@b.cl",
      phone: null,
      message: "hola hola",
      read: true,
      archived: false,
      createdAt: "2026-10-01T12:00:00.000Z",
    });
    expect(toContactMessage("y", { name: "A", email: "a@b.cl", message: "hola", createdAt: null })).toBeNull();
  });
});
