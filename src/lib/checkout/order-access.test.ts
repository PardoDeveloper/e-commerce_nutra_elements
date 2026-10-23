import { describe, expect, it } from "vitest";
import { MAX_REMEMBERED_ORDERS, ORDER_ACCESS_KEY, recallOrderToken, rememberOrderToken, type StorageLike } from "./order-access";
import { resolvePaymentsMode } from "./payments-mode";

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("token de acceso guardado en el navegador (A2)", () => {
  it("recuerda y recupera por número de pedido", () => {
    const s = memory();
    rememberOrderToken(s, "NE-000001", "tok-1");
    rememberOrderToken(s, "NE-000002", "tok-2");
    expect(recallOrderToken(s, "NE-000001")).toBe("tok-1");
    expect(recallOrderToken(s, "NE-000002")).toBe("tok-2");
    expect(recallOrderToken(s, "NE-000003")).toBeNull();
  });

  it("guarda solo número y token, sin duplicados y con tope", () => {
    const s = memory();
    for (let i = 0; i < MAX_REMEMBERED_ORDERS + 5; i++) rememberOrderToken(s, `NE-${i}`, `t${i}`);
    rememberOrderToken(s, "NE-30", "nuevo");
    const saved = JSON.parse(s.data.get(ORDER_ACCESS_KEY)!) as { o: string; t: string }[];
    expect(saved).toHaveLength(MAX_REMEMBERED_ORDERS);
    expect(saved[0]).toEqual({ o: "NE-30", t: "nuevo" });
    expect(Object.keys(saved[0]!).sort()).toEqual(["o", "t"]);
  });

  it("tolera datos corruptos y almacenamiento bloqueado", () => {
    const s = memory();
    s.data.set(ORDER_ACCESS_KEY, "{no es json");
    expect(recallOrderToken(s, "NE-000001")).toBeNull();
    const blocked: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(() => rememberOrderToken(blocked, "NE-000001", "x")).not.toThrow();
  });
});

describe("resolvePaymentsMode", () => {
  it("demo es simulado; firebase es sandbox solo si se declara explícitamente", () => {
    expect(resolvePaymentsMode("demo", "production")).toBe("simulated");
    expect(resolvePaymentsMode("firebase", "sandbox")).toBe("sandbox");
    expect(resolvePaymentsMode("firebase", "production")).toBe("live");
    // Sin la variable no se afirma que el pago sea de prueba.
    expect(resolvePaymentsMode("firebase", undefined)).toBe("live");
  });
});
