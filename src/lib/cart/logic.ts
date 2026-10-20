// Lógica pura del carrito (sin React ni navegador): fácil de probar.
// El carrito guarda un snapshot de visualización. El precio mostrado NO es el que
// se cobra: el servidor recalcula todo a partir de [{sku, qty}] (D-005).

export interface CartLine {
  sku: string;
  name: string;
  slug: string;
  categoryId: string;
  /** Precio de lista, solo para mostrar. */
  unitPrice: number;
  /** Precio efectivo con descuento, solo para mostrar. */
  finalPrice: number;
  qty: number;
}

export type CartItemInput = Omit<CartLine, "qty">;

export const DEFAULT_MAX_QTY = 10;
export const MAX_LINES = 20; // límite por pedido del contrato (items: 1..20)

function clampQty(qty: number, max: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.min(Math.max(Math.trunc(qty), 1), max);
}

/** Fusiona líneas con el mismo SKU sumando cantidades (D-027). Conserva el orden. */
export function mergeLines(lines: readonly CartLine[], max = DEFAULT_MAX_QTY): CartLine[] {
  const bySku = new Map<string, CartLine>();
  for (const line of lines) {
    const existing = bySku.get(line.sku);
    bySku.set(
      line.sku,
      existing
        ? { ...existing, ...line, qty: clampQty(existing.qty + line.qty, max) }
        : { ...line, qty: clampQty(line.qty, max) },
    );
  }
  return [...bySku.values()];
}

export function addItem(
  lines: readonly CartLine[],
  item: CartItemInput,
  qty = 1,
  max = DEFAULT_MAX_QTY,
): CartLine[] {
  const merged = mergeLines([...lines, { ...item, qty }], max);
  return merged.slice(0, MAX_LINES);
}

export function removeItem(lines: readonly CartLine[], sku: string): CartLine[] {
  return lines.filter((l) => l.sku !== sku);
}

/** Cambia la cantidad. Una cantidad menor que 1 quita la línea. */
export function setQty(lines: readonly CartLine[], sku: string, qty: number, max = DEFAULT_MAX_QTY): CartLine[] {
  if (!Number.isFinite(qty) || qty < 1) return removeItem(lines, sku);
  return lines.map((l) => (l.sku === sku ? { ...l, qty: clampQty(qty, max) } : l));
}

export function countItems(lines: readonly CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/** Subtotal SOLO para mostrar (precios finales de visualización). */
export function subtotalOf(lines: readonly CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.finalPrice * l.qty, 0);
}

/** Lo único que se envía al servidor al crear el pedido (D-005). */
export function toOrderItems(lines: readonly CartLine[]): Array<{ sku: string; qty: number }> {
  return mergeLines(lines).map((l) => ({ sku: l.sku, qty: l.qty }));
}

function isLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sku === "string" &&
    /^[A-Za-z0-9_-]{1,32}$/.test(v.sku) &&
    typeof v.name === "string" &&
    typeof v.slug === "string" &&
    typeof v.categoryId === "string" &&
    typeof v.unitPrice === "number" &&
    typeof v.finalPrice === "number" &&
    typeof v.qty === "number"
  );
}

/** Lee el JSON guardado en localStorage con validación; descarta lo inválido. */
export function parseStoredCart(raw: string | null, max = DEFAULT_MAX_QTY): CartLine[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return mergeLines(data.filter(isLine), max).slice(0, MAX_LINES);
  } catch {
    return [];
  }
}
