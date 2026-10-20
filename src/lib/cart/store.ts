"use client";

// Store del carrito en el navegador, con persistencia en localStorage.
// No necesita Provider: es un store externo leído con useSyncExternalStore, así que
// el HTML del servidor y la primera hidratación salen con el carrito vacío (sin
// desajustes) y luego se actualiza con lo guardado.
import { useMemo, useSyncExternalStore } from "react";
import {
  addItem,
  countItems,
  parseStoredCart,
  removeItem,
  setQty,
  subtotalOf,
  type CartItemInput,
  type CartLine,
} from "./logic";

const STORAGE_KEY = "ne.cart.v1";
const EMPTY: readonly CartLine[] = Object.freeze([]);

let lines: readonly CartLine[] | null = null;
const listeners = new Set<() => void>();

function read(): readonly CartLine[] {
  if (lines === null) {
    try {
      lines = parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      lines = EMPTY; // localStorage bloqueado: el carrito vive solo en memoria
    }
  }
  return lines;
}

function commit(next: readonly CartLine[]): void {
  lines = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* sin almacenamiento: se mantiene en memoria */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Sincroniza entre pestañas.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      lines = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = (): readonly CartLine[] => EMPTY;

const subscribeNever = () => () => {};

export interface CartApi {
  lines: readonly CartLine[];
  /** Total de unidades (para el contador del header). */
  count: number;
  /** Subtotal solo para mostrar; el servidor recalcula (D-005). */
  subtotal: number;
  /** false en el servidor y en la primera hidratación: no mostrar el contador antes. */
  hydrated: boolean;
  add: (item: CartItemInput, qty?: number) => void;
  remove: (sku: string) => void;
  setQuantity: (sku: string, qty: number) => void;
  clear: () => void;
}

/** Acciones estables (también se pueden usar fuera de React, en el navegador). */
export const cartActions = {
  add: (item: CartItemInput, qty = 1) => commit(addItem(read(), item, qty)),
  remove: (sku: string) => commit(removeItem(read(), sku)),
  setQuantity: (sku: string, qty: number) => commit(setQty(read(), sku, qty)),
  clear: () => commit(EMPTY),
};

/** Hook del carrito para Client Components. */
export function useCart(): CartApi {
  const current = useSyncExternalStore(subscribe, read, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return useMemo(
    () => ({
      lines: current,
      count: countItems(current),
      subtotal: subtotalOf(current),
      hydrated,
      ...cartActions,
    }),
    [current, hydrated],
  );
}
