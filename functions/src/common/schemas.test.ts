import { describe, expect, it } from "vitest";
import { getAppErrorCode } from "./errors.js";
import { createOrderRequestSchema, normalizePhone, parseCreateOrderRequest } from "./schemas.js";

const UUID = "3f2b8c1e-5d4a-4c7b-9a1e-0f6d2b8c4e11";

function validRequest(): Record<string, unknown> {
  return {
    clientRequestId: UUID,
    items: [
      { sku: "2427831", qty: 2 },
      { sku: "2427851", qty: 1 },
    ],
    paymentMethod: "flow",
    customer: { firstName: "Ana", lastName: "Pérez", email: "Ana@Example.com", phone: "+56 9 1234 5678", rut: "12.345.678-5" },
    delivery: { type: "shipping", communeCode: "puente-alto", address: "Calle Falsa 123, depto 4", notes: "Dejar con conserje" },
  };
}

function failure(data: unknown): { code: string | undefined; details: { fields?: { path: string; message: string }[] } } {
  try {
    parseCreateOrderRequest(data);
  } catch (e) {
    return { code: getAppErrorCode(e), details: (e as { details: never }).details };
  }
  return { code: undefined, details: {} };
}

function withChange(mutate: (r: Record<string, unknown>) => void): Record<string, unknown> {
  const r = validRequest();
  mutate(r);
  return r;
}

const customerOf = (r: Record<string, unknown>) => r["customer"] as Record<string, unknown>;
const deliveryOf = (r: Record<string, unknown>) => r["delivery"] as Record<string, unknown>;

describe("createOrderRequestSchema: caso válido", () => {
  it("acepta el request completo y lo normaliza", () => {
    const r = parseCreateOrderRequest(validRequest());
    expect(r.customer.rut).toBe("12345678-5");
    expect(r.customer.email).toBe("ana@example.com");
    expect(r.customer.phone).toBe("+56912345678");
    expect(r.items).toHaveLength(2);
    expect(r.delivery).toMatchObject({ type: "shipping", communeCode: "puente-alto" });
  });

  it("acepta retiro en tienda", () => {
    const r = parseCreateOrderRequest(withChange((x) => (x["delivery"] = { type: "pickup" })));
    expect(r.delivery).toEqual({ type: "pickup" });
  });

  it("acepta transferencia y notas ausentes", () => {
    const r = parseCreateOrderRequest(
      withChange((x) => {
        x["paymentMethod"] = "transfer";
        delete deliveryOf(x)["notes"];
      }),
    );
    expect(r.paymentMethod).toBe("transfer");
  });

  it("recorta espacios y pasa clientRequestId a minúsculas", () => {
    const r = parseCreateOrderRequest(
      withChange((x) => {
        x["clientRequestId"] = ` ${UUID.toUpperCase()} `;
        customerOf(x)["firstName"] = "  Ana  ";
      }),
    );
    expect(r.clientRequestId).toBe(UUID);
    expect(r.customer.firstName).toBe("Ana");
  });
});

describe("createOrderRequestSchema: RUT", () => {
  it("RUT inválido, vacío o ausente (único error) -> INVALID_RUT", () => {
    for (const rut of ["12345678-4", "", "abc"]) {
      expect(failure(withChange((x) => (customerOf(x)["rut"] = rut))).code).toBe("INVALID_RUT");
    }
    expect(failure(withChange((x) => delete customerOf(x)["rut"])).code).toBe("INVALID_RUT");
    expect(failure(withChange((x) => (customerOf(x)["rut"] = 123456785))).code).toBe("INVALID_RUT");
  });

  it("el error no repite el RUT", () => {
    const f = failure(withChange((x) => (customerOf(x)["rut"] = "99999999-9")));
    expect(JSON.stringify(f)).not.toContain("99999999");
  });

  it("acepta k minúscula y sin puntos", () => {
    const r = parseCreateOrderRequest(withChange((x) => (customerOf(x)["rut"] = "20000003-k")));
    expect(r.customer.rut).toBe("20000003-K");
  });

  it("RUT inválido junto con otro error -> INVALID_INPUT con fields", () => {
    const f = failure(
      withChange((x) => {
        customerOf(x)["rut"] = "1-1";
        customerOf(x)["firstName"] = "";
      }),
    );
    expect(f.code).toBe("INVALID_INPUT");
    expect(f.details.fields?.map((i) => i.path)).toContain("customer.firstName");
  });
});

describe("createOrderRequestSchema: campos desconocidos (D-005)", () => {
  it.each(["price", "total", "shipping", "discount", "subtotal", "unitFinalPrice"])("rechaza %s en la raíz", (key) => {
    expect(failure(withChange((x) => (x[key] = 1))).code).toBe("INVALID_INPUT");
  });

  it("rechaza precio dentro de un ítem, del cliente y de la entrega", () => {
    expect(failure(withChange((x) => ((x["items"] as Record<string, unknown>[])[0]!["price"] = 1))).code).toBe("INVALID_INPUT");
    expect(failure(withChange((x) => (customerOf(x)["role"] = "admin"))).code).toBe("INVALID_INPUT");
    expect(failure(withChange((x) => (deliveryOf(x)["fee"] = 0))).code).toBe("INVALID_INPUT");
  });

  it("no repite el nombre del campo desconocido en el error", () => {
    const f = failure(withChange((x) => (x["campoMalicioso"] = 1)));
    expect(JSON.stringify(f.details)).not.toContain("campoMalicioso");
  });
});

describe("createOrderRequestSchema: ítems", () => {
  const items = (v: unknown) => withChange((x) => (x["items"] = v));
  it("vacío, ausente o con más de 20 líneas", () => {
    expect(failure(items([])).code).toBe("INVALID_INPUT");
    expect(failure(withChange((x) => delete x["items"])).code).toBe("INVALID_INPUT");
    const many = Array.from({ length: 21 }, (_, i) => ({ sku: `S${i}`, qty: 1 }));
    expect(failure(items(many)).code).toBe("INVALID_INPUT");
    expect(failure(items(many.slice(0, 20))).code).toBeUndefined();
  });

  it.each([0, -1, 1.5, 101, "2", null, Number.NaN])("qty %s inválida", (qty) => {
    expect(failure(items([{ sku: "A", qty }])).code).toBe("INVALID_INPUT");
  });

  it("SKU inválido o repetido", () => {
    for (const sku of ["", "a/b", "con espacio", "x".repeat(33), 123]) {
      expect(failure(items([{ sku, qty: 1 }])).code).toBe("INVALID_INPUT");
    }
    expect(
      failure(
        items([
          { sku: "A", qty: 1 },
          { sku: "A", qty: 1 },
        ]),
      ).code,
    ).toBe("INVALID_INPUT");
  });
});

describe("createOrderRequestSchema: cliente", () => {
  const setCustomer = (key: string, value: unknown) => withChange((x) => (customerOf(x)[key] = value));

  it("nombre y apellido: 1..60, sin controles", () => {
    expect(failure(setCustomer("firstName", "   ")).code).toBe("INVALID_INPUT");
    expect(failure(setCustomer("lastName", "x".repeat(61))).code).toBe("INVALID_INPUT");
    expect(failure(setCustomer("firstName", "x".repeat(60))).code).toBeUndefined();
    expect(failure(setCustomer("firstName", "Ana\u0000")).code).toBe("INVALID_INPUT");
    expect(failure(setCustomer("lastName", "Pé\nrez")).code).toBe("INVALID_INPUT");
  });

  it("correo: formato válido y <= 254", () => {
    for (const email of ["", "sin-arroba", "a@", "@b.cl", "a b@c.cl"]) {
      expect(failure(setCustomer("email", email)).code).toBe("INVALID_INPUT");
    }
    const long = `${"a".repeat(250)}@x.cl`;
    expect(failure(setCustomer("email", long)).code).toBe("INVALID_INPUT");
  });

  it("teléfono: 8..15 dígitos, normalizado", () => {
    expect(failure(setCustomer("phone", "1234567")).code).toBe("INVALID_INPUT");
    expect(failure(setCustomer("phone", "1234567890123456")).code).toBe("INVALID_INPUT");
    expect(failure(setCustomer("phone", "abc12345678")).code).toBe("INVALID_INPUT");
    expect(parseCreateOrderRequest(setCustomer("phone", "9 1234-5678")).customer.phone).toBe("912345678");
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+56912345678", "+56912345678"],
    ["+56 (9) 1234-5678", "+56912345678"],
    ["912345678", "912345678"],
    ["12345678", "12345678"],
    ["+123456789012345", "+123456789012345"],
  ])("%s -> %s", (i, o) => {
    expect(normalizePhone(i)).toBe(o);
  });
  it.each(["", "1234567", "1234567890123456", "12-ab-5678", "56+912345678", "++56912345678"])("%s inválido", (i) => {
    expect(normalizePhone(i)).toBeNull();
  });
});

describe("createOrderRequestSchema: entrega, pago e idempotencia", () => {
  it("clientRequestId debe ser UUID v4", () => {
    for (const id of ["", "abc", "3f2b8c1e-5d4a-1c7b-9a1e-0f6d2b8c4e11", 5]) {
      expect(failure(withChange((x) => (x["clientRequestId"] = id))).code).toBe("INVALID_INPUT");
    }
    expect(failure(withChange((x) => delete x["clientRequestId"])).code).toBe("INVALID_INPUT");
  });

  it("método de pago desconocido", () => {
    expect(failure(withChange((x) => (x["paymentMethod"] = "webpay"))).code).toBe("INVALID_INPUT");
  });

  it("despacho: dirección 5..200, notas <= 300, comuna con formato de slug", () => {
    const setDelivery = (key: string, value: unknown) => withChange((x) => (deliveryOf(x)[key] = value));
    expect(failure(setDelivery("address", "abcd")).code).toBe("INVALID_INPUT");
    expect(failure(setDelivery("address", "x".repeat(201))).code).toBe("INVALID_INPUT");
    expect(failure(setDelivery("notes", "x".repeat(301))).code).toBe("INVALID_INPUT");
    expect(failure(setDelivery("communeCode", "Puente Alto")).code).toBe("INVALID_INPUT");
    expect(failure(setDelivery("communeCode", "")).code).toBe("INVALID_INPUT");
  });

  it("despacho sin dirección o tipo desconocido", () => {
    expect(failure(withChange((x) => delete deliveryOf(x)["address"])).code).toBe("INVALID_INPUT");
    expect(failure(withChange((x) => (x["delivery"] = { type: "courier" }))).code).toBe("INVALID_INPUT");
  });

  it("retiro no admite dirección ni comuna", () => {
    expect(failure(withChange((x) => (x["delivery"] = { type: "pickup", address: "otra calle 123" }))).code).toBe("INVALID_INPUT");
  });

  it("no es un objeto", () => {
    for (const v of [null, undefined, "x", 5, []]) {
      expect(failure(v).code).toBe("INVALID_INPUT");
    }
  });

  it("el esquema exportado coincide con el parser", () => {
    expect(createOrderRequestSchema.safeParse(validRequest()).success).toBe(true);
  });
});
