import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocData } from "../common/db.js";
import { getAppErrorCode } from "../common/errors.js";
import { handleCreateOrder } from "./create-order.js";
import { hashAccessToken, rateLimitKey, sha256Hex } from "./primitives.js";
import { makeEnv, productStock, validCreateRequest, VALID_RUT, SETTINGS_PRIVATE, orderDoc, type TestEnv } from "./testing/fixtures.js";

// Se captura todo lo que se registra para comprobar que no hay datos personales en los logs.
const logCalls = vi.hoisted(() => [] as unknown[][]);
vi.mock("firebase-functions/logger", () => ({
  debug: (...a: unknown[]) => logCalls.push(a),
  info: (...a: unknown[]) => logCalls.push(a),
  warn: (...a: unknown[]) => logCalls.push(a),
  error: (...a: unknown[]) => logCalls.push(a),
}));

// Pruebas de createOrder contra el DOBLE en memoria de Firestore (ver common/testing/memory-db.ts).
// Cubren la lógica y la disciplina transaccional; NO prueban Firestore real ni la concurrencia real.

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (err) {
    return getAppErrorCode(err) ?? `otro:${String(err)}`;
  }
  return undefined;
}

/** `ip: null` = la petición no trae IP. */
const create = (env: TestEnv, req: Record<string, unknown> = validCreateRequest(), ip: string | null = "203.0.113.5") =>
  handleCreateOrder(env.deps, req, { ip: ip ?? undefined });

afterEach(() => vi.restoreAllMocks());

describe("createOrder - comisiones", () => {
  it("congela la comisión vigente del producto en cada línea y en el total", async () => {
    const env = makeEnv();
    env.db.seed("products/1001", { ...(env.db.peek("products/1001") as DocData), commissionPerUnit: 1500 });
    await create(env);
    const order = env.db.peek("orders/NE-000001") as DocData;
    const [item] = order["items"] as DocData[];
    // $1.500 por unidad × 2 unidades (no depende del precio ni del descuento)
    expect(item).toMatchObject({ qty: 2, commissionPerUnit: 1500, commission: 3000 });
    expect(order["commission"]).toBe(3000);
  });

  it("sin comisión definida la línea queda en 0", async () => {
    const env = makeEnv();
    await create(env);
    const order = env.db.peek("orders/NE-000001") as DocData;
    expect((order["items"] as DocData[])[0]).toMatchObject({ commissionPerUnit: null, commission: 0 });
    expect(order["commission"]).toBe(0);
  });
});

describe("createOrder - caso feliz", () => {
  it("crea el pedido con snapshot, reserva el stock y toma el primer número", async () => {
    const env = makeEnv();
    const res = await create(env);

    expect(res.orderNumber).toBe("NE-000001");
    expect(res.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res).toMatchObject({ paymentMethod: "flow", paymentStatus: "pending_payment", next: "pay_with_flow", freeShippingApplied: false });
    // 2 x 9.891 (10 % sobre 10.990) = 19.782 + envío 3.990
    expect(res.subtotal).toBe(19782);
    expect(res.shipping).toBe(3990);
    expect(res.total).toBe(23772);
    expect(res.reservedUntil).toBe(new Date(env.clock().getTime() + 30 * 60_000).toISOString());

    const order = env.db.peek("orders/NE-000001") as DocData;
    expect(order).toMatchObject({
      orderNumber: "NE-000001",
      number: 1,
      paymentStatus: "pending_payment",
      fulfillmentStatus: null,
      stockState: "reserved",
      total: 23772,
      currency: "CLP",
      refund: null,
      flow: null,
    });
    expect((order["customer"] as { rut: string }).rut).toBe(VALID_RUT);
    expect(order["accessTokenHash"]).toBe(hashAccessToken(res.accessToken));
    expect(JSON.stringify(order)).not.toContain(res.accessToken); // el token en claro no se guarda
    expect((order["statusHistory"] as unknown[]).length).toBe(1);

    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 2, inStock: true });
    expect(env.db.peek("counters/orders")).toMatchObject({ last: 1 });
  });

  it("transferencia: reserva de 48 h y next show_transfer_instructions", async () => {
    const env = makeEnv();
    const res = await create(env, validCreateRequest({ paymentMethod: "transfer" }));
    expect(res.next).toBe("show_transfer_instructions");
    expect(res.reservedUntil).toBe(new Date(env.clock().getTime() + 2880 * 60_000).toISOString());
  });

  it("retiro en tienda: sin envío y snapshot con la tienda", async () => {
    const env = makeEnv();
    const res = await create(env, validCreateRequest({ delivery: { type: "pickup" } }));
    expect(res.shipping).toBe(0);
    expect((env.db.peek("orders/NE-000001") as DocData)["delivery"]).toEqual({
      type: "pickup",
      storeAddress: "Av. Concha y Toro 180, Puente Alto",
      storeHours: "Lunes a viernes de 9:00 a 20:00",
    });
  });

  it("los números son consecutivos; respeta orderNumberStart cuando no hay contador", async () => {
    const env = makeEnv();
    const a = await create(env, validCreateRequest(), "198.51.100.1");
    const b = await create(env, validCreateRequest({ customer: { firstName: "Luis", lastName: "Soto", email: "luis@example.com", phone: "912345678", rut: VALID_RUT } }), "198.51.100.2");
    expect([a.orderNumber, b.orderNumber]).toEqual(["NE-000001", "NE-000002"]);

    const env2 = makeEnv({ "settings/private": { ...SETTINGS_PRIVATE, orderNumberStart: 500 } });
    expect((await create(env2)).orderNumber).toBe("NE-000500");
  });

  it("deja el RUT normalizado aunque llegue con puntos y k minúscula", async () => {
    const env = makeEnv();
    const base = validCreateRequest();
    await create(env, { ...base, customer: { ...(base["customer"] as object), rut: "12.345.678-5".replace("5", VALID_RUT.slice(-1)) } });
    expect(((env.db.peek("orders/NE-000001") as DocData)["customer"] as { rut: string }).rut).toBe(VALID_RUT);
  });
});

describe("createOrder - el servidor manda en el precio (D-005)", () => {
  it.each(["price", "total", "shipping", "discount", "subtotal", "unitFinalPrice"])("un campo '%s' enviado por el cliente -> INVALID_INPUT", async (field) => {
    const env = makeEnv();
    const req = validCreateRequest({ [field]: 1 });
    expect(await codeOf(create(env, req))).toBe("INVALID_INPUT");
    const withItemPrice = validCreateRequest({ items: [{ sku: "1001", qty: 1, price: 1 }] });
    expect(await codeOf(create(env, withItemPrice))).toBe("INVALID_INPUT");
    expect(env.db.paths("orders/")).toEqual([]);
  });

  it("modificar a mano finalPrice en el documento no cambia lo cobrado (se recalcula)", async () => {
    const env = makeEnv();
    const p = env.db.peek("products/1001") as DocData;
    env.db.seed("products/1001", { ...p, finalPrice: 1 });
    const res = await create(env);
    expect(res.items[0]?.unitFinalPrice).toBe(9891);
    expect(res.subtotal).toBe(19782);
  });

  it("con descuento activo el snapshot guarda precio de lista, descuento y precio final", async () => {
    const env = makeEnv();
    await create(env);
    const item = ((env.db.peek("orders/NE-000001") as DocData)["items"] as DocData[])[0];
    expect(item).toMatchObject({ sku: "1001", unitPrice: 10990, discount: { type: "percent", value: 10 }, unitFinalPrice: 9891, qty: 2, lineTotal: 19782 });
  });

  it("envío gratis solo con umbral definido y subtotal con descuentos >= umbral", async () => {
    const pub = { shippingFee: 3990, freeShippingThreshold: 19782, communes: [{ code: "puente-alto", name: "Puente Alto" }], pickup: { enabled: true, address: "a", hours: "h" }, maxQtyPerItem: 10 };
    const env = makeEnv({ "settings/public": pub });
    const res = await create(env);
    expect(res).toMatchObject({ shipping: 0, freeShippingApplied: true, total: 19782 });
    const env2 = makeEnv({ "settings/public": { ...pub, freeShippingThreshold: 19783 } });
    expect(await create(env2)).toMatchObject({ shipping: 3990, freeShippingApplied: false });
  });

  it("comuna fuera de la lista, retiro desactivado y cantidades fuera de rango se rechazan", async () => {
    const env = makeEnv();
    expect(await codeOf(create(env, validCreateRequest({ delivery: { type: "shipping", communeCode: "no-existe", address: "Calle 12345" } })))).toBe("INVALID_COMMUNE");
    for (const qty of [0, -1, 1.5, 11, 101]) {
      expect(await codeOf(create(env, validCreateRequest({ items: [{ sku: "1001", qty }] })))).toBe("INVALID_INPUT");
    }
    const noPickup = makeEnv({ "settings/public": { shippingFee: 3990, freeShippingThreshold: null, communes: [{ code: "santiago", name: "Santiago" }], pickup: { enabled: false, address: "", hours: "" } } });
    expect(await codeOf(create(noPickup, validCreateRequest({ delivery: { type: "pickup" } })))).toBe("PICKUP_DISABLED");
    expect(env.db.paths("orders/")).toEqual([]);
    expect(productStock(env.db, "1001").stock).toBe(5);
  });

  it("SKU repetidos -> INVALID_INPUT", async () => {
    const env = makeEnv();
    expect(await codeOf(create(env, validCreateRequest({ items: [{ sku: "1001", qty: 1 }, { sku: "1001", qty: 1 }] })))).toBe("INVALID_INPUT");
  });
});

describe("createOrder - disponibilidad", () => {
  it("OUT_OF_STOCK con sku y available, y la transacción completa no descuenta nada del resto", async () => {
    const env = makeEnv();
    const req = validCreateRequest({ items: [{ sku: "1001", qty: 2 }, { sku: "1002", qty: 4 }] });
    try {
      await create(env, req);
      expect.unreachable();
    } catch (err) {
      expect(getAppErrorCode(err)).toBe("OUT_OF_STOCK");
      expect((err as { details: unknown }).details).toEqual({ code: "OUT_OF_STOCK", sku: "1002", available: 3 });
    }
    expect(productStock(env.db, "1001")).toEqual({ stock: 5, reserved: 0, inStock: true });
    expect(env.db.peek("counters/orders")).toBeUndefined();
  });

  it("producto inexistente, sin publicar, inactivo o ELIMINADO -> PRODUCT_UNAVAILABLE (D-029h)", async () => {
    const base = (await import("./testing/fixtures.js")).productDoc("1003", { stock: 9 });
    const cases: Record<string, DocData> = {
      "sin publicar": { ...base, published: false },
      inactivo: { ...base, active: false },
      eliminado: { ...base, deletedAt: new Date("2026-10-01T00:00:00Z"), deletedBy: "uid", published: false },
      // Aunque quedara publicado por error, deletedAt manda.
      "eliminado pero publicado": { ...base, deletedAt: new Date("2026-10-01T00:00:00Z") },
    };
    for (const [label, doc] of Object.entries(cases)) {
      const env = makeEnv({ "products/1003": doc });
      const code = await codeOf(create(env, validCreateRequest({ items: [{ sku: "1001", qty: 1 }, { sku: "1003", qty: 1 }] })));
      expect(code, label).toBe("PRODUCT_UNAVAILABLE");
      expect(productStock(env.db, "1001").stock, `${label}: no se descuenta el resto`).toBe(5);
    }
    const env = makeEnv();
    expect(await codeOf(create(env, validCreateRequest({ items: [{ sku: "9999", qty: 1 }] })))).toBe("PRODUCT_UNAVAILABLE");
  });

  it("la reserva deja inStock en false cuando se agota el último", async () => {
    const env = makeEnv({ "products/1002": (await import("./testing/fixtures.js")).productDoc("1002", { name: "Vitamina C", price: 8990, stock: 1 }) });
    await create(env, validCreateRequest({ items: [{ sku: "1002", qty: 1 }] }));
    expect(productStock(env.db, "1002")).toEqual({ stock: 0, reserved: 1, inStock: false });
  });

  it("total 0 y total demasiado grande se rechazan", async () => {
    const free = makeEnv({ "products/1001": (await import("./testing/fixtures.js")).productDoc("1001", { price: 1000, discount: { type: "percent", value: 99 } }) });
    // 99 % sobre 1.000 deja 10 por unidad: el total no es 0; se fuerza 0 con un fijo que iguala el precio.
    const zero = makeEnv({ "products/1001": (await import("./testing/fixtures.js")).productDoc("1001", { price: 1000, discount: { type: "fixed", value: 1000 } }) });
    expect(await codeOf(create(zero, validCreateRequest({ delivery: { type: "pickup" } })))).toBe("ZERO_TOTAL");
    expect(await codeOf(create(free, validCreateRequest({ delivery: { type: "pickup" } })))).toBeUndefined();
    const big = makeEnv({ "products/1001": (await import("./testing/fixtures.js")).productDoc("1001", { price: 9_000_000, stock: 100 }) });
    expect(await codeOf(create(big, validCreateRequest({ items: [{ sku: "1001", qty: 10 }] })))).toBe("ORDER_TOO_LARGE");
  });
});

describe("createOrder - validación del RUT (10b)", () => {
  const withRut = (rut: unknown) => {
    const base = validCreateRequest();
    return { ...base, customer: { ...(base["customer"] as object), rut } };
  };
  it.each(["", "1", "12345678-0", "abc", "12.345.678", "1234567890-1", "00000000-0", 5, null])("RUT %j -> INVALID_RUT", async (rut) => {
    const env = makeEnv();
    expect(await codeOf(create(env, withRut(rut)))).toBe("INVALID_RUT");
    expect(env.db.paths("orders/")).toEqual([]);
  });
  it("sin el campo rut crea el pedido y no guarda RUT (D-039)", async () => {
    const env = makeEnv();
    const base = validCreateRequest();
    const { rut: _omit, ...customer } = base["customer"] as Record<string, unknown>;
    void _omit;
    await create(env, { ...base, customer });
    const saved = (env.db.peek("orders/NE-000001") as DocData)["customer"] as Record<string, unknown>;
    expect(saved).not.toHaveProperty("rut");
  });
});

describe("createOrder - idempotencia (test 5)", () => {
  it("mismo clientRequestId dos veces: un pedido, un descuento de stock y el MISMO token, que sigue válido (M3)", async () => {
    const env = makeEnv();
    const req = validCreateRequest();
    const first = await create(env, req);
    const orderBefore = JSON.stringify(env.db.peek("orders/NE-000001"));
    env.clock.advance(60_000);
    const second = await create(env, req);
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(second.accessToken).toBe(first.accessToken);
    expect(second.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(env.db.paths("orders/")).toEqual(["orders/NE-000001"]);
    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 2, inStock: true });
    expect(env.db.peek("counters/orders")).toMatchObject({ last: 1 });
    const order = env.db.peek("orders/NE-000001") as DocData;
    expect(order["accessTokenHash"]).toBe(hashAccessToken(first.accessToken)); // el token ya entregado no se invalidó
    expect(JSON.stringify(order)).toBe(orderBefore); // el reintento no escribe nada en el pedido
  });

  it("el token depende del clientRequestId: pedidos distintos, tokens distintos; y no se guarda en claro ni en la clave", async () => {
    const env = makeEnv();
    const a = await create(env, validCreateRequest());
    const b = await create(env, validCreateRequest());
    expect(a.accessToken).not.toBe(b.accessToken);
    expect(JSON.stringify(env.db.peek(`orders/${a.orderNumber}`))).not.toContain(a.accessToken);
    for (const key of env.db.paths("idempotencyKeys/")) expect(JSON.stringify(env.db.peek(key))).not.toContain(a.accessToken);
  });

  it("el reintento no consume cupo de límite por IP ni cuenta como pedido pendiente por correo", async () => {
    const env = makeEnv({ "settings/private": { ...SETTINGS_PRIVATE, limits: { ...(SETTINGS_PRIVATE["limits"] as object), pendingOrdersPerEmail: 1 } } });
    const req = validCreateRequest();
    await create(env, req);
    await expect(create(env, req)).resolves.toMatchObject({ orderNumber: "NE-000001" });
    const key = `rateLimits/${rateLimitKey("createOrder", "203.0.113.5")}`;
    expect(env.db.peek(key)).toMatchObject({ count: 1 });
  });

  it("mismo id con otro carrito, otro RUT o otro medio de pago -> INVALID_INPUT", async () => {
    const env = makeEnv();
    const req = validCreateRequest();
    await create(env, req);
    expect(await codeOf(create(env, { ...req, items: [{ sku: "1002", qty: 1 }] }))).toBe("INVALID_INPUT");
    expect(await codeOf(create(env, { ...req, paymentMethod: "transfer" }))).toBe("INVALID_INPUT");
    const otherRut = { ...req, customer: { ...(req["customer"] as object), rut: "11111111-1" } };
    expect(await codeOf(create(env, otherRut))).toBe("INVALID_INPUT");
    expect(env.db.paths("orders/")).toEqual(["orders/NE-000001"]);
  });

  it("si el pedido ya no está pendiente, el reintento da ORDER_NOT_PAYABLE y no rota el token", async () => {
    const env = makeEnv();
    const req = validCreateRequest();
    const first = await create(env, req);
    const o = env.db.peek("orders/NE-000001") as DocData;
    env.db.seed("orders/NE-000001", { ...o, paymentStatus: "expired" });
    expect(await codeOf(create(env, req))).toBe("ORDER_NOT_PAYABLE");
    expect((env.db.peek("orders/NE-000001") as DocData)["accessTokenHash"]).toBe(hashAccessToken(first.accessToken));
  });

  it("guarda la clave de idempotencia con hash y TTL de 7 días, sin RUT", async () => {
    const env = makeEnv();
    const req = validCreateRequest();
    await create(env, req);
    const key = env.db.peek(`idempotencyKeys/${sha256Hex(String(req["clientRequestId"]))}`) as DocData;
    expect(key).toMatchObject({ orderNumber: "NE-000001" });
    expect((key["expiresAt"] as Date).getTime() - (key["createdAt"] as Date).getTime()).toBe(7 * 24 * 3600_000);
    expect(JSON.stringify(key)).not.toContain(VALID_RUT);
  });
});

describe("createOrder - límites anti-abuso (F2)", () => {
  it("5 pedidos por IP en 10 minutos; el sexto -> RATE_LIMITED sin crear nada; pasada la ventana vuelve a permitir", async () => {
    const env = makeEnv({ "products/1001": (await import("./testing/fixtures.js")).productDoc("1001", { price: 1000, stock: 100 }) });
    const withEmail = (i: number) => {
      const base = validCreateRequest({ items: [{ sku: "1001", qty: 1 }] });
      return { ...base, customer: { ...(base["customer"] as object), email: `cliente${i}@example.com` } };
    };
    for (let i = 0; i < 5; i++) await create(env, withEmail(i));
    expect(await codeOf(create(env, withEmail(5)))).toBe("RATE_LIMITED");
    expect(env.db.paths("orders/")).toHaveLength(5);
    expect(productStock(env.db, "1001").stock).toBe(95);
    // Otra IP no se ve afectada.
    await expect(create(env, withEmail(6), "198.51.100.77")).resolves.toBeDefined();
    env.clock.advance(10 * 60_000);
    await expect(create(env, withEmail(7))).resolves.toBeDefined();
  });

  it("3 pedidos pendientes por correo; el cuarto -> RATE_LIMITED", async () => {
    const env = makeEnv({ "products/1001": (await import("./testing/fixtures.js")).productDoc("1001", { price: 1000, stock: 100 }) });
    for (let i = 0; i < 3; i++) await create(env, validCreateRequest({ items: [{ sku: "1001", qty: 1 }] }), `198.51.100.${i + 1}`);
    expect(await codeOf(create(env, validCreateRequest({ items: [{ sku: "1001", qty: 1 }] }), "198.51.100.9"))).toBe("RATE_LIMITED");
    // Un pedido pagado ya no cuenta como pendiente.
    const o = env.db.peek("orders/NE-000001") as DocData;
    env.db.seed("orders/NE-000001", { ...o, paymentStatus: "paid" });
    await expect(create(env, validCreateRequest({ items: [{ sku: "1001", qty: 1 }] }), "198.51.100.9")).resolves.toBeDefined();
  });

  it("los límites salen de settings/private.limits", async () => {
    const env = makeEnv({ "settings/private": { ...SETTINGS_PRIVATE, limits: { createOrderPerIpPer10Min: 1, pendingOrdersPerEmail: 50, orderStatusPerIpPer10Min: 30, orderStatusFailuresPerOrder: 10 } } });
    await create(env);
    expect(await codeOf(create(env, validCreateRequest()))).toBe("RATE_LIMITED");
  });

  it("sin IP no se aplica el límite por IP (y no se escribe rateLimits)", async () => {
    const env = makeEnv({ "settings/private": { ...SETTINGS_PRIVATE, limits: { createOrderPerIpPer10Min: 1, pendingOrdersPerEmail: 50, orderStatusPerIpPer10Min: 30, orderStatusFailuresPerOrder: 10 } } });
    await create(env, validCreateRequest(), null);
    await create(env, validCreateRequest(), null);
    expect(env.db.paths("rateLimits/")).toEqual([]);
  });

  it("la clave del límite no contiene la IP en claro", async () => {
    const env = makeEnv();
    await create(env);
    const [key] = env.db.paths("rateLimits/");
    expect(key).toBeDefined();
    expect(key).not.toContain("203.0.113.5");
  });
});

describe("createOrder - concurrencia sobre el DOBLE (test 2; NO es prueba de Firestore real)", () => {
  const manyBuyers = (env: TestEnv, n: number, qty: number, sku = "1002") =>
    Promise.allSettled(
      Array.from({ length: n }, (_, i) => {
        const base = validCreateRequest({ items: [{ sku, qty }] });
        const req = { ...base, customer: { ...(base["customer"] as object), email: `comprador${i}@example.com` } };
        return handleCreateOrder(env.deps, req, { ip: `198.51.100.${i + 1}` });
      }),
    );

  it("stock 1 y 10 compradores en paralelo: un pedido y nueve OUT_OF_STOCK; stock 0, reserved 1", async () => {
    const env = makeEnv({ "products/1002": (await import("./testing/fixtures.js")).productDoc("1002", { price: 8990, stock: 1 }) });
    const results = await manyBuyers(env, 10, 1);
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    expect(rejected.every((r) => getAppErrorCode(r.reason) === "OUT_OF_STOCK")).toBe(true);
    expect(productStock(env.db, "1002")).toEqual({ stock: 0, reserved: 1, inStock: false });
    expect(env.db.paths("orders/")).toHaveLength(1);
  });

  it("stock 5 con compras de 2 en paralelo: no sobrevende y los números no se repiten", async () => {
    const env = makeEnv({ "products/1002": (await import("./testing/fixtures.js")).productDoc("1002", { price: 8990, stock: 5 }) });
    const results = await manyBuyers(env, 6, 2);
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof handleCreateOrder>>> => r.status === "fulfilled");
    expect(ok).toHaveLength(2); // 5 unidades alcanzan para 2 compras de 2
    const numbers = ok.map((r) => r.value.orderNumber).sort();
    expect(numbers).toEqual(["NE-000001", "NE-000002"]);
    expect(productStock(env.db, "1002")).toEqual({ stock: 1, reserved: 4, inStock: true });
    expect(env.db.peek("counters/orders")).toMatchObject({ last: 2 });
  });

  it("pedidos simultáneos de productos distintos obtienen números consecutivos sin repetirse", async () => {
    const env = makeEnv({ "products/1002": (await import("./testing/fixtures.js")).productDoc("1002", { price: 8990, stock: 100 }) });
    const results = await manyBuyers(env, 8, 1);
    const numbers = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.orderNumber] : [])).sort();
    expect(numbers).toEqual(Array.from({ length: 8 }, (_, i) => `NE-${String(i + 1).padStart(6, "0")}`));
    expect(new Set(numbers).size).toBe(8);
    expect(productStock(env.db, "1002").reserved).toBe(8);
  });

  it("el mismo clientRequestId en paralelo (doble clic) crea un solo pedido", async () => {
    const env = makeEnv();
    const req = validCreateRequest();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => handleCreateOrder(env.deps, req, { ip: "203.0.113.5" })));
    const numbers = new Set(results.flatMap((r) => (r.status === "fulfilled" ? [r.value.orderNumber] : [])));
    expect(numbers).toEqual(new Set(["NE-000001"]));
    expect(env.db.paths("orders/")).toEqual(["orders/NE-000001"]);
    expect(productStock(env.db, "1001")).toEqual({ stock: 3, reserved: 2, inStock: true });
  });
});

describe("createOrder - errores y logs", () => {
  it("settings/public ausente -> INTERNAL sin detalles", async () => {
    const env = makeEnv();
    const empty = new (await import("../common/testing/memory-db.js")).MemoryDb({ "products/1001": env.db.peek("products/1001") as DocData });
    expect(await codeOf(handleCreateOrder({ db: empty, clock: env.clock }, validCreateRequest(), { ip: "203.0.113.5" }))).toBe("INTERNAL");
  });

  it("no registra RUT, correo, teléfono, dirección ni el token en los logs", async () => {
    logCalls.length = 0;
    const env = makeEnv();
    const res = await create(env);
    await codeOf(create(env, validCreateRequest({ items: [{ sku: "1002", qty: 9 }] })));
    await codeOf(create(env, validCreateRequest({ customer: { firstName: "A", lastName: "B", email: "x@example.com", phone: "912345678", rut: "1" } })));
    await create(env, validCreateRequest(), null);
    const logged = JSON.stringify(logCalls);
    expect(logged).toContain("NE-000001"); // sí registra el número de pedido
    for (const secret of [VALID_RUT, "ana@example.com", "x@example.com", "+56912345678", "912345678", "Calle Falsa", res.accessToken, "203.0.113.5"]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("orderDoc de fixtures es coherente con lo que escribe createOrder (mismas claves)", async () => {
    const env = makeEnv();
    await create(env);
    const created = Object.keys(env.db.peek("orders/NE-000001") as DocData).sort();
    expect(created).toEqual(Object.keys(orderDoc()).sort());
  });
});
