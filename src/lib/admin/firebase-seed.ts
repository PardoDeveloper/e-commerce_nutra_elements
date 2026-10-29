// Documentos iniciales de Firestore para el botón «Crear ajustes iniciales» / «Crear categorías iniciales».
// Funciones puras: cumplen EXACTAMENTE `validPublicSettings`, `validPrivateSettings` y `validCategory` de
// firestore.rules (data-model v1.3). `updatedAt` y `createdAt` los agrega el servicio con `serverTimestamp()`.
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS as PUBLIC_DEFAULTS } from "@/lib/data/defaults";
import { DEFAULT_LIMITS } from "./firebase-mappers";

type Doc = Record<string, unknown>;

/** Reserva por defecto (data-model 2.5): Flow 30 min, el único medio de pago (D-044). */
const RESERVATION_MINUTES = { flow: 30 } as const;

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

/** settings/private sin `updatedAt`. */
export function buildInitialPrivateSettings(): Doc {
  return {
    reservationMinutes: { ...RESERVATION_MINUTES },
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
