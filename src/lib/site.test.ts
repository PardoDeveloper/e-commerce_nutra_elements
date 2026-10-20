import { describe, expect, it } from "vitest";
import { getSiteUrl, isIndexable } from "./site";

const env = (v: Record<string, string>) => v as unknown as NodeJS.ProcessEnv;

describe("isIndexable", () => {
  it("es false si SITE_INDEXABLE no está definida", () => {
    expect(isIndexable(env({}))).toBe(false);
  });
  it("es false con valores distintos de 'true'", () => {
    for (const v of ["", "false", "TRUE", "1", "yes", " true"]) {
      expect(isIndexable(env({ SITE_INDEXABLE: v }))).toBe(false);
    }
  });
  it("es true solo con 'true'", () => {
    expect(isIndexable(env({ SITE_INDEXABLE: "true" }))).toBe(true);
  });
});

describe("getSiteUrl", () => {
  it("usa el origen local por defecto", () => {
    expect(getSiteUrl(env({}))).toBe("http://localhost:3000");
  });
  it("quita la barra final", () => {
    expect(getSiteUrl(env({ SITE_URL: "https://nutraelements.cl/" }))).toBe(
      "https://nutraelements.cl",
    );
  });
});
