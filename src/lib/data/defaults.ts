// Valores por defecto de la tienda, compartidos por el mock y por la implementación de Firestore
// (que los usa cuando `categories` o `settings/public` aún no existen en el proyecto).
import type { Category, PublicSettings } from "./types";

// Las 52 comunas de la Región Metropolitana (data-model 7.5).
const COMMUNE_NAMES = [
  "Alhué", "Buin", "Calera de Tango", "Cerrillos", "Cerro Navia", "Colina", "Conchalí", "Curacaví",
  "El Bosque", "El Monte", "Estación Central", "Huechuraba", "Independencia", "Isla de Maipo",
  "La Cisterna", "La Florida", "La Granja", "La Pintana", "La Reina", "Lampa", "Las Condes",
  "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú", "María Pinto", "Melipilla", "Ñuñoa",
  "Padre Hurtado", "Paine", "Pedro Aguirre Cerda", "Peñaflor", "Peñalolén", "Pirque", "Providencia",
  "Pudahuel", "Puente Alto", "Quilicura", "Quinta Normal", "Recoleta", "Renca", "San Bernardo",
  "San Joaquín", "San José de Maipo", "San Miguel", "San Pedro", "San Ramón", "Santiago", "Talagante",
  "Tiltil", "Vitacura",
];

function slugifyCommune(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

export const DEFAULT_SETTINGS: PublicSettings = {
  shippingFee: 3990,
  freeShippingThreshold: null,
  communes: COMMUNE_NAMES.map((name) => ({ code: slugifyCommune(name), name })),
  pickup: {
    enabled: true,
    address: "Av. Concha y Toro 180, Puente Alto",
    hours: "Lunes a viernes, de 9:00 a 20:00",
  },
  maxQtyPerItem: 10,
};

/** Las 6 categorías iniciales de D-023, sin texto de introducción. */
export const DEFAULT_CATEGORIES: Category[] = [
  { slug: "vitaminas", name: "Vitaminas", order: 10, seo: null, description: null },
  { slug: "magnesio", name: "Magnesio", order: 20, seo: null, description: null },
  { slug: "minerales", name: "Minerales", order: 30, seo: null, description: null },
  { slug: "omega-3", name: "Omega 3", order: 40, seo: null, description: null },
  { slug: "belleza", name: "Belleza", order: 50, seo: null, description: null },
  { slug: "bienestar", name: "Bienestar", order: 60, seo: null, description: null },
];
