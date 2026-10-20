import { describe, expect, it } from "vitest";
import { AdminServiceError } from "./errors";
import {
  buildContentUpdate,
  buildSettingsWrites,
  DEFAULT_SETTINGS,
  mapOrder,
  mapProduct,
  mergeSettings,
  storageUrl,
  toIso,
  validateContentPatch,
} from "./firebase-mappers";
import { makeProduct } from "./testing";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe("mapProduct", () => {
  it("convierte Timestamps, imágenes y valores ausentes", () => {
    const p = mapProduct(
      "1001",
      {
        name: "Magnesio",
        price: 10000,
        finalPrice: 9000,
        stock: 4,
        reserved: 1,
        active: true,
        published: true,
        images: [{ path: "products/1001/abc12345.webp", alt: "Frasco" }, { nope: true }],
        deletedAt: ts("2026-10-01T10:00:00Z"),
        deletedBy: "uid-1",
        discount: { type: "percent", value: 10 },
        source: "controlfarma-xls",
      },
      "bucket-x",
    );
    expect(p.deletedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(p.images).toEqual([
      { path: "products/1001/abc12345.webp", alt: "Frasco", previewUrl: storageUrl("bucket-x", "products/1001/abc12345.webp") },
    ]);
    expect(p.discount).toEqual({ type: "percent", value: 10 });
    expect(p.inStock).toBe(true);
    expect(p.slug).toBeNull();
  });

  it("un producto vigente tiene deletedAt null", () => {
    expect(mapProduct("2", { name: "A", price: 1 }, "").deletedAt).toBeNull();
  });
});

describe("storageUrl y toIso", () => {
  it("codifica la ruta del objeto", () => {
    expect(storageUrl("b.appspot.com", "products/1/a.webp")).toBe(
      "https://firebasestorage.googleapis.com/v0/b/b.appspot.com/o/products%2F1%2Fa.webp?alt=media",
    );
  });
  it("un valor pendiente da null", () => {
    expect(toIso(null)).toBeNull();
    expect(toIso(undefined)).toBeNull();
  });
});

describe("mapOrder", () => {
  it("convierte fechas del historial y del reembolso", () => {
    const o = mapOrder("NE-000001", {
      paymentMethod: "transfer",
      paymentStatus: "refunded",
      fulfillmentStatus: "delivered",
      stockState: "committed",
      customer: { firstName: "Ana" },
      delivery: { type: "pickup", storeAddress: "A", storeHours: "H" },
      items: [{ sku: "1", name: "X", unitPrice: 10, unitFinalPrice: 10, qty: 2, lineTotal: 20 }],
      total: 20,
      statusHistory: [
        { at: ts("2026-10-02T00:00:00Z"), kind: "payment", from: "paid", to: "refunded", by: "uid", refund: { amount: 20, method: "transfer", restock: true } },
      ],
      refund: {
        amount: 20,
        method: "transfer",
        refundedAt: ts("2026-10-02T00:00:00Z"),
        note: "n",
        restock: true,
        restocked: true,
        recordedBy: "uid",
        recordedAt: ts("2026-10-02T01:00:00Z"),
      },
      paidAt: ts("2026-10-01T00:00:00Z"),
      createdAt: ts("2026-10-01T00:00:00Z"),
      updatedAt: ts("2026-10-02T01:00:00Z"),
    });
    expect(o.orderNumber).toBe("NE-000001");
    expect(o.statusHistory[0]!.at).toBe("2026-10-02T00:00:00.000Z");
    expect(o.refund?.recordedAt).toBe("2026-10-02T01:00:00.000Z");
    expect(o.delivery.type).toBe("pickup");
    expect(o.paidAt).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("contenido de producto", () => {
  it("solo envía campos permitidos, sin undefined, y reduce las imágenes a {path, alt}", () => {
    const data = buildContentUpdate({
      name: "Nuevo",
      images: [{ path: "products/1/a.webp", alt: " Frasco ", previewUrl: "blob:x", bytes: 5 }],
      seo: { title: "T", description: undefined },
      slug: undefined,
      // Un campo que no es de contenido (precio) debe ignorarse aunque llegue por error.
      ...({ price: 1 } as object),
    });
    expect(data).toEqual({ name: "Nuevo", images: [{ path: "products/1/a.webp", alt: "Frasco" }], seo: { title: "T" } });
    expect(Object.values(data).some((v) => v === undefined)).toBe(false);
  });

  it("un seo vacío se guarda como null", () => {
    expect(buildContentUpdate({ seo: { title: "", description: undefined } })).toEqual({ seo: null });
  });

  it("valida como las reglas", () => {
    const base = makeProduct({ published: true, slug: "a" });
    expect(() => validateContentPatch(base, { slug: "b" })).toThrow(/publicado/);
    expect(() => validateContentPatch({ ...base, published: false }, { slug: "B B" })).toThrow(AdminServiceError);
    expect(() => validateContentPatch(base, { name: "" })).toThrow(AdminServiceError);
    expect(() => validateContentPatch(base, { format: "x".repeat(41) })).toThrow(AdminServiceError);
    expect(() => validateContentPatch({ ...base, deletedAt: "2026-01-01T00:00:00Z" }, { name: "x" })).toThrow(/eliminado/);
    expect(() => validateContentPatch(base, { name: "Ok", slug: "a" })).not.toThrow();
  });
});

describe("ajustes", () => {
  const rawPublic = {
    communes: [{ code: "puente-alto", name: "Puente Alto" }],
    shippingFee: 1,
    freeShippingThreshold: null,
    pickup: { enabled: true, address: "a", hours: "h" },
    maxQtyPerItem: 5,
  };
  const rawPrivate = {
    limits: { createOrderPerIpPer10Min: 9 },
    orderNumberStart: 50,
    reservationMinutes: { flow: 20, transfer: 100 },
    bank: { bankName: "B", accountType: "C", accountNumber: "1", holderName: "H", holderRut: "1-9" },
  };

  it("sin documentos usa los valores iniciales del contrato", () => {
    expect(mergeSettings(null, null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.shippingFee).toBe(3990);
  });

  it("une settings/public y settings/private", () => {
    const s = mergeSettings(rawPublic, rawPrivate);
    expect(s.shippingFee).toBe(1);
    expect(s.reservationMinutes).toEqual({ flow: 20, transfer: 100 });
    expect(s.bank.bankName).toBe("B");
  });

  it("al guardar conserva comunas, límites y orderNumberStart, con exactamente las claves de las reglas", () => {
    const settings = mergeSettings(rawPublic, rawPrivate);
    const { publicDoc, privateDoc } = buildSettingsWrites({ ...settings, shippingFee: 2990 }, rawPublic, rawPrivate);
    expect(Object.keys(publicDoc).sort()).toEqual(["communes", "freeShippingThreshold", "maxQtyPerItem", "pickup", "shippingFee"]);
    expect(publicDoc.shippingFee).toBe(2990);
    expect(publicDoc.communes).toBe(rawPublic.communes);
    expect(Object.keys(privateDoc).sort()).toEqual(["bank", "limits", "orderNumberStart", "reservationMinutes"]);
    expect(privateDoc.orderNumberStart).toBe(50);
    expect(privateDoc.limits).toEqual({ createOrderPerIpPer10Min: 9 });
  });

  it("si settings/public no existe, explica que falta el sembrado", () => {
    expect(() => buildSettingsWrites(DEFAULT_SETTINGS, null, null)).toThrow(/sembrado/);
  });
});
