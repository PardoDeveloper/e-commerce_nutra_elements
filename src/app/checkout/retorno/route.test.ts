import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const req = (query: string, method = "POST") =>
  new Request(`https://tienda.example/checkout/retorno${query}`, {
    method,
    ...(method === "POST" ? { body: "token=FLOWTOKEN", headers: { "Content-Type": "application/x-www-form-urlencoded" } } : {}),
  });

describe("/checkout/retorno (retorno de Flow)", () => {
  it("POST de Flow: 303 a la página del pedido, ignorando el cuerpo", () => {
    const res = POST(req("?o=NE-000123"));
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/pedido/NE-000123");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("GET también funciona y normaliza mayúsculas", () => {
    expect(GET(req("?o=ne-000045", "GET")).headers.get("Location")).toBe("/pedido/NE-000045");
  });

  it("un número inválido o ausente lleva al inicio (sin redirección abierta)", () => {
    for (const q of ["", "?o=", "?o=//evil.example", "?o=NE-12", "?o=NE-000123/../../x"]) {
      expect(POST(req(q)).headers.get("Location")).toBe("/");
    }
  });

  it("A2: la redirección nunca agrega un token de acceso", () => {
    expect(POST(req("?o=NE-000123&t=secreto")).headers.get("Location")).toBe("/pedido/NE-000123");
  });
});
