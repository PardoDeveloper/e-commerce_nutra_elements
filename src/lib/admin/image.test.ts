import { describe, expect, it } from "vitest";
import { fitToBudget, fitWithin, formatBytes, MAX_BYTES, validateImageFile } from "./image";

describe("fitWithin", () => {
  it("no agranda imágenes pequeñas", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("reduce el lado largo a 1600 manteniendo la proporción", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 800, height: 1600 });
  });
  it("tolera tamaños inválidos", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe("validateImageFile", () => {
  it("acepta formatos conocidos y rechaza el resto", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 }, 0).ok).toBe(true);
    expect(validateImageFile({ type: "application/pdf", size: 1000 }, 0).ok).toBe(false);
    expect(validateImageFile({ type: "image/png", size: 0 }, 0).ok).toBe(false);
    expect(validateImageFile({ type: "image/png", size: 21 * 1024 * 1024 }, 0).ok).toBe(false);
  });
  it("limita a 8 imágenes por producto", () => {
    expect(validateImageFile({ type: "image/webp", size: 10 }, 8).ok).toBe(false);
    expect(validateImageFile({ type: "image/webp", size: 10 }, 7).ok).toBe(true);
  });
});

describe("fitToBudget", () => {
  it("usa la mejor calidad que cabe en 2 MiB", async () => {
    const calls: number[] = [];
    const result = await fitToBudget({ width: 1600, height: 1200 }, async (_w, _h, q) => {
      calls.push(q);
      return q > 0.7 ? MAX_BYTES + 1 : MAX_BYTES - 1;
    });
    expect(result).toMatchObject({ width: 1600, height: 1200, quality: 0.65 });
    expect(calls).toEqual([0.85, 0.75, 0.65]);
  });
  it("reduce las dimensiones si la calidad mínima no alcanza", async () => {
    const result = await fitToBudget({ width: 1600, height: 1600 }, async (w) => (w > 1200 ? MAX_BYTES * 2 : 1000));
    expect(result).not.toBeNull();
    expect(result!.width).toBeLessThanOrEqual(1200);
  });
  it("devuelve null si es imposible", async () => {
    expect(await fitToBudget({ width: 1600, height: 1600 }, async () => MAX_BYTES * 10)).toBeNull();
  });
});

describe("formatBytes", () => {
  it("formatea", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KiB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.00 MiB");
  });
});
