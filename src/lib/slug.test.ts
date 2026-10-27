import { describe, expect, it } from "vitest";
import { SLUG_PATTERN, slugify } from "./slug";

describe("slugify", () => {
  it("pasa a minúsculas, quita tildes y cambia espacios por guiones", () => {
    expect(slugify("Citrato de Magnesio 120 Cápsulas")).toBe("citrato-de-magnesio-120-capsulas");
    expect(slugify("Belleza y Bienestar")).toBe("belleza-y-bienestar");
    expect(slugify("Piñas")).toBe("pinas");
  });

  it("colapsa separadores y no deja guiones en los extremos", () => {
    expect(slugify("  Omega 3 -- (1000 mg)  ")).toBe("omega-3-1000-mg");
    expect(slugify("¡¡!!")).toBe("");
  });

  it("respeta el largo máximo sin terminar en guion", () => {
    const slug = slugify("a ".repeat(100), 9);
    expect(slug).toBe("a-a-a-a-a");
    expect(SLUG_PATTERN.test(slug)).toBe(true);
  });
});
