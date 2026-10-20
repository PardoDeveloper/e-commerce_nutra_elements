// Utilidades de formato (es-CL). Seguras para servidor y cliente.

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/** 12990 -> "$12.990". */
export function formatClp(amount: number): string {
  return clp.format(Math.round(amount));
}

/** Porcentaje de descuento entero entre el precio de lista y el final (0 si no hay). */
export function discountPercent(price: number, finalPrice: number): number {
  if (price <= 0 || finalPrice >= price) return 0;
  return Math.round((1 - finalPrice / price) * 100);
}
