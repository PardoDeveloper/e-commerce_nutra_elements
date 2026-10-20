// Documentos iniciales de Firestore para el botón «Crear ajustes iniciales» / «Crear categorías iniciales».
// Funciones puras: cumplen EXACTAMENTE `validPublicSettings`, `validPrivateSettings` y `validCategory` de
// firestore.rules (data-model v1.3). `updatedAt` y `createdAt` los agrega el servicio con `serverTimestamp()`.
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS as PUBLIC_DEFAULTS } from "@/lib/data/defaults";
import { TEST_BANK_HOLDER_RUT, TEST_BANK_NAME } from "@/lib/bank";
import { DEFAULT_LIMITS } from "./firebase-mappers";

type Doc = Record<string, unknown>;

/** Mínimo de reserva por defecto (data-model 2.5): Flow 30 min, transferencia 48 h. */
const RESERVATION_MINUTES = { flow: 30, transfer: 2880 } as const;

/** settings/public sin `updatedAt`: comunas de la RM, despacho $3.990, umbral vacío, tienda y máximo por producto. */
export function buildInitialPublicSettings(): Doc {
  return {
    shippingFee: PUBLIC_DEFAULTS.shippingFee,
    freeShippingThreshold: null,
    communes: PUBLIC_DEFAULTS.communes.map((c) => ({ code: c.code, name: c.name })),
    pickup: { enabled: PUBLIC_DEFAULTS.pickup.enabled, address: PUBLIC_DEFAULTS.pickup.address, hours: PUBLIC_DEFAULTS.pickup.hours },
    maxQtyPerItem: PUBLIC_DEFAULTS.maxQtyPerItem,
  };
}

/**
 * settings/private sin `updatedAt`. Los datos bancarios son DE PRUEBA (data-model 2.5) porque las reglas exigen
 * textos no vacíos; Carlos los reemplaza desde Ajustes con los reales.
 */
export function buildInitialPrivateSettings(): Doc {
  return {
    reservationMinutes: { ...RESERVATION_MINUTES },
    bank: {
      bankName: TEST_BANK_NAME,
      accountType: "Cuenta corriente",
      accountNumber: "000000000",
      holderName: "Nutra Elements (prueba)",
      holderRut: TEST_BANK_HOLDER_RUT,
    },
    orderNumberStart: 1,
    limits: { ...DEFAULT_LIMITS },
  };
}

export interface InitialCategory {
  id: string;
  /** Sin `createdAt` ni `updatedAt` (los pone el servicio). */
  data: Doc;
}

/** Las 6 categorías de D-023, publicadas y sin textos opcionales. */
export function buildInitialCategories(): InitialCategory[] {
  return DEFAULT_CATEGORIES.map((c) => ({ id: c.slug, data: { slug: c.slug, name: c.name, order: c.order, published: true } }));
}
