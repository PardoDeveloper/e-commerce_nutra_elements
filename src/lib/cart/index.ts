// Carrito del cliente (D-027, D-028). Solo para Client Components: `useCart()`.
// La lógica pura (sin React) está en ./logic y se puede usar en el servidor.
export { useCart, cartActions, type CartApi } from "./store";
export {
  addItem,
  removeItem,
  setQty,
  mergeLines,
  countItems,
  subtotalOf,
  toOrderItems,
  parseStoredCart,
  DEFAULT_MAX_QTY,
  MAX_LINES,
  type CartLine,
  type CartItemInput,
} from "./logic";
