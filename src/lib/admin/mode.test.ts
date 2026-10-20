import { afterEach, describe, expect, it } from "vitest";
import { isDemoMode, resolveDataSource } from "../data-source";
import { demoLogin } from "./session";
import { isDemoLoginAvailable, setActiveDataSource, sim } from "./mode";

afterEach(() => setActiveDataSource("demo"));

describe("fuente de datos del admin", () => {
  it("el login simulado solo existe con demo", () => {
    expect(isDemoLoginAvailable("demo")).toBe(true);
    expect(isDemoLoginAvailable("firebase")).toBe(false);
  });

  it("con K_SERVICE y DATA_SOURCE=demo el login simulado NO está disponible", () => {
    const env = { K_SERVICE: "nutra-elements", DATA_SOURCE: "demo" };
    expect(isDemoMode(env)).toBe(false);
    expect(isDemoLoginAvailable(resolveDataSource(env))).toBe(false);
    // Sin entorno de nube y con demo, sí existe.
    expect(isDemoLoginAvailable(resolveDataSource({ DATA_SOURCE: "demo" }))).toBe(true);
  });

  it("demoLogin no hace nada con firebase (ni siquiera toca el navegador)", () => {
    setActiveDataSource("firebase");
    // En Node no existe `window`: si la función llegara a usar sessionStorage, lanzaría.
    expect(() => demoLogin("alguien@ejemplo.cl")).not.toThrow();
  });

  it("sim quita las marcas de la demostración solo con firebase", () => {
    const text = "Contenido guardado (simulado). Se pierden al recargar la página.";
    setActiveDataSource("demo");
    expect(sim(text)).toBe(text);
    setActiveDataSource("firebase");
    expect(sim(text)).toBe("Contenido guardado.");
    expect(sim("Aplicar (simulado)")).toBe("Aplicar");
  });
});
