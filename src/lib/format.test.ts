import { describe, expect, it } from "vitest";
import { discountPercent, formatClp } from "./format";

describe("formato CLP", () => {
  it("formatea con punto de miles y sin decimales", () => {
    // Intl puede usar un espacio fino entre el símbolo y la cifra según la versión de ICU.
    expect(formatClp(12990).replace(/\s/g, "")).toBe("$12.990");
    expect(formatClp(990).replace(/\s/g, "")).toBe("$990");
  });

  it("calcula el porcentaje de descuento", () => {
    expect(discountPercent(10000, 8500)).toBe(15);
    expect(discountPercent(10000, 10000)).toBe(0);
    expect(discountPercent(0, 0)).toBe(0);
  });
});
