// Datos que el servidor entrega a las pantallas de carrito y checkout (solo servidor).
// El carrito del cliente guarda únicamente {sku, qty}; los precios llegan desde aquí (D-005).
import { getProducts, getPublicSettings } from "@/lib/data";
import { isTransferOffered } from "@/lib/bank";
import { resolveDataSource } from "@/lib/data-source";
import type { MockSettings } from "./mock-service";
import { toCatalogEntry, type CatalogEntry } from "./summary";

export interface CheckoutData {
  catalog: Record<string, CatalogEntry>;
  settings: MockSettings;
  /** ¿Se ofrece «Transferencia»? Ver `isTransferOffered`. */
  transferAvailable: boolean;
}

/**
 * Solo para la demo: `DEMO_FREE_SHIPPING_THRESHOLD=30000` activa el envío gratis sin tocar la
 * capa de datos (el mock trae umbral null). Solo tiene efecto si resolveDataSource() === "demo": con firebase o
 * en la nube se ignora (D-005, el umbral real sale de settings/public). Se ignora si no es un entero positivo.
 */
export function demoThreshold(fallback: number | null, env: Readonly<Record<string, string | undefined>> = process.env): number | null {
  if (resolveDataSource(env) !== "demo") return fallback;
  const raw = env.DEMO_FREE_SHIPPING_THRESHOLD;
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

export async function loadCheckoutData(): Promise<CheckoutData> {
  const [products, settings] = await Promise.all([getProducts(), getPublicSettings()]);
  const catalog: Record<string, CatalogEntry> = {};
  for (const p of products) catalog[p.sku] = toCatalogEntry(p);
  // settings/private (banco) no es legible con las reglas públicas del servidor: con firebase se trata como
  // "sin datos bancarios" hasta que exista una Cloud Function que informe si hay banco real configurado.
  const transferAvailable = isTransferOffered(resolveDataSource(), null);
  return {
    transferAvailable,
    catalog,
    settings: {
      shippingFee: settings.shippingFee,
      freeShippingThreshold: demoThreshold(settings.freeShippingThreshold),
      communes: settings.communes,
      pickup: settings.pickup,
      maxQtyPerItem: settings.maxQtyPerItem,
    },
  };
}
