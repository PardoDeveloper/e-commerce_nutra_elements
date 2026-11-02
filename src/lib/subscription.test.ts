import { describe, expect, it } from "vitest";
import { SUBSCRIPTION_URL, subscriptionUrl } from "./subscription";

describe("subscriptionUrl", () => {
  it("apunta al formulario externo con UTM y el punto de origen", () => {
    const url = new URL(subscriptionUrl("inicio"));
    expect(url.origin + url.pathname).toBe(SUBSCRIPTION_URL);
    expect(url.searchParams.get("utm_source")).toBe("nutraelements");
    expect(url.searchParams.get("utm_medium")).toBe("web");
    expect(url.searchParams.get("utm_campaign")).toBe("suscripcion");
    expect(url.searchParams.get("utm_content")).toBe("inicio");
  });

  it("agrega el producto cuando se pulsa desde la ficha", () => {
    expect(new URL(subscriptionUrl("ficha", "colageno-60")).searchParams.get("utm_content")).toBe("ficha-colageno-60");
  });
});
