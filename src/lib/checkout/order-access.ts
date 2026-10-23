// Token de acceso de los pedidos, guardado en el navegador del comprador (A2, D-036).
// `createOrder` entrega el token una sola vez; se guarda aquí para que, al volver de Flow, la página
// del pedido pueda consultar el estado sin que el token viaje en la URL de retorno que se envía a Flow.
// Solo se guardan número y token: nada de datos personales.

export const ORDER_ACCESS_KEY = "ne.orderAccess.v1";
/** Pedidos que se recuerdan por navegador (los más recientes). */
export const MAX_REMEMBERED_ORDERS = 20;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type Entry = { o: string; t: string };

function read(storage: StorageLike): Entry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(ORDER_ACCESS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is Entry => typeof e === "object" && e !== null && typeof e.o === "string" && typeof e.t === "string");
  } catch {
    return [];
  }
}

/** Recuerda el token de un pedido (el más reciente queda primero). Si el almacenamiento falla, no hace nada. */
export function rememberOrderToken(storage: StorageLike, orderNumber: string, accessToken: string): void {
  if (!orderNumber || !accessToken) return;
  const entries = [{ o: orderNumber, t: accessToken }, ...read(storage).filter((e) => e.o !== orderNumber)].slice(0, MAX_REMEMBERED_ORDERS);
  try {
    storage.setItem(ORDER_ACCESS_KEY, JSON.stringify(entries));
  } catch {
    // almacenamiento bloqueado o lleno: el comprador conserva el enlace con el token en pantalla
  }
}

export function recallOrderToken(storage: StorageLike, orderNumber: string): string | null {
  return read(storage).find((e) => e.o === orderNumber)?.t ?? null;
}

/** `localStorage` si existe y se puede usar; si no, `null`. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
