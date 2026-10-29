// Datos iniciales del proyecto (data-model.md 2.2, 2.5 y 7.5; D-023). Función pura: no toca Firestore.
// El script `functions/scripts/seed.mjs` las escribe.

export interface SeedCategory {
  slug: string;
  name: string;
  description: string | null;
  imagePath: null;
  order: number;
  published: boolean;
  seo: null;
}

export interface SeedCommune {
  code: string;
  name: string;
}

export interface SeedSettingsPublic {
  shippingFee: number;
  freeShippingThreshold: number | null;
  communes: SeedCommune[];
  pickup: { enabled: boolean; address: string; hours: string };
  maxQtyPerItem: number;
}

export interface SeedSettingsPrivate {
  reservationMinutes: { flow: number };
  orderNumberStart: number;
  limits: {
    createOrderPerIpPer10Min: number;
    pendingOrdersPerEmail: number;
    orderStatusPerIpPer10Min: number;
    orderStatusFailuresPerOrder: number;
  };
}

export interface SeedData {
  categories: SeedCategory[];
  settingsPublic: SeedSettingsPublic;
  settingsPrivate: SeedSettingsPrivate;
}

/** Las 52 comunas de la Región Metropolitana (data-model.md 7.5), en el orden del contrato. */
const COMMUNE_NAMES = [
  "Santiago", "Cerrillos", "Cerro Navia", "Conchalí", "El Bosque", "Estación Central", "Huechuraba",
  "Independencia", "La Cisterna", "La Florida", "La Granja", "La Pintana", "La Reina", "Las Condes",
  "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú", "Ñuñoa", "Pedro Aguirre Cerda", "Peñalolén",
  "Providencia", "Pudahuel", "Quilicura", "Quinta Normal", "Recoleta", "Renca", "San Joaquín", "San Miguel",
  "San Ramón", "Vitacura", "Puente Alto", "Pirque", "San José de Maipo", "Colina", "Lampa", "Til Til",
  "San Bernardo", "Buin", "Calera de Tango", "Paine", "Melipilla", "Alhué", "Curacaví", "María Pinto",
  "San Pedro", "Talagante", "El Monte", "Isla de Maipo", "Padre Hurtado", "Peñaflor",
];

/** Slug sin tildes ni eñes: "Ñuñoa" -> "nunoa", "San José de Maipo" -> "san-jose-de-maipo". */
export function communeCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Descripciones neutras: sin propiedades de curar, tratar o prevenir enfermedades (normativa chilena).
const CATEGORY_BASE = [
  { slug: "vitaminas", name: "Vitaminas", order: 10, description: "Vitaminas B12, complejo B, C, D y E, y multivitamínicos en cápsulas y comprimidos." },
  { slug: "magnesio", name: "Magnesio", order: 20, description: "Citrato, bisglicinato y otras formas de magnesio en cápsulas." },
  { slug: "minerales", name: "Minerales", order: 30, description: "Zinc, potasio y otros minerales en suplementos alimentarios." },
  { slug: "omega-3", name: "Omega 3", order: 40, description: "Suplementos de omega 3 y omega 369 en cápsulas blandas." },
  { slug: "belleza", name: "Belleza", order: 50, description: "Colágeno y biotina como parte de tu rutina de cuidado personal." },
  { slug: "bienestar", name: "Bienestar", order: 60, description: "Spirulina, melena de león, cúrcuma, cranberry y la línea Ultra." },
];

/** Arma los documentos iniciales (sin timestamps: los agrega el script con la hora del servidor). */
export function buildSeedData(): SeedData {
  const communes = COMMUNE_NAMES.map((name) => ({ code: communeCode(name), name }));
  return {
    categories: CATEGORY_BASE.map((c) => ({ ...c, imagePath: null, published: true, seo: null })),
    settingsPublic: {
      shippingFee: 3990,
      freeShippingThreshold: null,
      communes,
      pickup: { enabled: true, address: "Av. Concha y Toro 180, Puente Alto", hours: "Lunes a viernes de 9:00 a 20:00" },
      maxQtyPerItem: 10,
    },
    settingsPrivate: {
      reservationMinutes: { flow: 30 },
      orderNumberStart: 1,
      limits: {
        createOrderPerIpPer10Min: 5,
        pendingOrdersPerEmail: 3,
        orderStatusPerIpPer10Min: 120,
        orderStatusFailuresPerOrder: 10,
      },
    },
  };
}
