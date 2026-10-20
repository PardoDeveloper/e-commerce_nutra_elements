import { describe, expect, it } from "vitest";
import { canConfirmDelete, namesPreview, requiresConfirmWord, selectionState, toggleAllVisible, visibleSelection } from "./selection";

const visible = ["a", "b", "c"];

describe("selección múltiple", () => {
  it("estado del encabezado: ninguno, parcial y todos", () => {
    expect(selectionState(new Set(), visible)).toBe("none");
    expect(selectionState(new Set(["a"]), visible)).toBe("some");
    expect(selectionState(new Set(["a", "b", "c"]), visible)).toBe("all");
    expect(selectionState(new Set(["a"]), [])).toBe("none");
  });

  it("lo seleccionado fuera de la lista visible no cuenta para el estado", () => {
    expect(selectionState(new Set(["z"]), visible)).toBe("none");
    expect(selectionState(new Set(["a", "b", "c", "z"]), visible)).toBe("all");
  });

  it("seleccionar todos actúa solo sobre la lista filtrada", () => {
    const next = toggleAllVisible(new Set(["z"]), ["a", "b"], true);
    expect([...next].sort()).toEqual(["a", "b", "z"]);
    expect(toggleAllVisible(next, ["a", "b"], false).has("a")).toBe(false);
  });

  it("no muta el conjunto original", () => {
    const original = new Set(["a"]);
    toggleAllVisible(original, visible, true);
    expect([...original]).toEqual(["a"]);
  });

  it("visibleSelection descarta lo oculto y conserva el orden de la tabla", () => {
    expect(visibleSelection(new Set(["c", "z", "a"]), visible)).toEqual(["a", "c"]);
  });
});

describe("confirmación", () => {
  it("pide la palabra solo con más de 5", () => {
    expect(requiresConfirmWord(5)).toBe(false);
    expect(requiresConfirmWord(6)).toBe(true);
  });

  it("habilita Confirmar según la palabra", () => {
    expect(canConfirmDelete(0, "")).toBe(false);
    expect(canConfirmDelete(2, "")).toBe(true);
    expect(canConfirmDelete(6, "")).toBe(false);
    expect(canConfirmDelete(6, "eliminar")).toBe(false);
    expect(canConfirmDelete(6, "ELIMINAR")).toBe(true);
  });

  it("lista hasta 10 nombres y dice cuántos faltan", () => {
    const names = Array.from({ length: 13 }, (_, i) => `P${i}`);
    expect(namesPreview(names)).toMatchObject({ more: 3 });
    expect(namesPreview(names).shown).toHaveLength(10);
    expect(namesPreview(["x"])).toEqual({ shown: ["x"], more: 0 });
  });
});
