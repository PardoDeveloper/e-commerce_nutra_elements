// Suscripción mensual (D-048): la inscripción se hace en un formulario externo. Nuestro sitio explica y enlaza.

export const SUBSCRIPTION_URL = "https://farmaciaestrella.apio.cl/";
export const SUBSCRIPTION_PAGE = "/suscripcion";

/** Desde dónde se pulsa el enlace. Va en utm_content para medir qué punto genera más suscripciones. */
export type SubscriptionPlacement = "pagina" | "ficha" | "inicio";

/** Enlace al formulario externo con parámetros UTM (y el producto, si se pulsó desde una ficha). */
export function subscriptionUrl(placement: SubscriptionPlacement, productSlug?: string): string {
  const url = new URL(SUBSCRIPTION_URL);
  url.searchParams.set("utm_source", "nutraelements");
  url.searchParams.set("utm_medium", "web");
  url.searchParams.set("utm_campaign", "suscripcion");
  url.searchParams.set("utm_content", productSlug ? `${placement}-${productSlug}` : placement);
  return url.toString();
}
