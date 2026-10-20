// Lógica pura de la selección múltiple de productos (D-029). "Seleccionar todos" actúa solo
// sobre la lista filtrada visible, nunca sobre productos que el filtro oculta.

/** Palabra que hay que escribir para confirmar una eliminación grande. */
export const CONFIRM_WORD = "ELIMINAR";
/** Con más de esta cantidad de productos se pide escribir la palabra. */
export const CONFIRM_WORD_THRESHOLD = 5;
/** Cuántos nombres lista el diálogo antes de decir "y N más". */
export const MAX_NAMES_LISTED = 10;

export type SelectionState = "none" | "some" | "all";

/** Estado del checkbox del encabezado respecto de la lista visible. */
export function selectionState(selected: ReadonlySet<string>, visibleSkus: readonly string[]): SelectionState {
  if (visibleSkus.length === 0) return "none";
  const count = visibleSkus.filter((sku) => selected.has(sku)).length;
  if (count === 0) return "none";
  return count === visibleSkus.length ? "all" : "some";
}

/** Marca o desmarca todos los visibles; conserva lo ya elegido fuera de la lista visible. */
export function toggleAllVisible(selected: ReadonlySet<string>, visibleSkus: readonly string[], checked: boolean): Set<string> {
  const next = new Set(selected);
  for (const sku of visibleSkus) {
    if (checked) next.add(sku);
    else next.delete(sku);
  }
  return next;
}

/** Solo lo elegido que sigue visible: una selección oculta por un filtro no se opera. */
export function visibleSelection(selected: ReadonlySet<string>, visibleSkus: readonly string[]): string[] {
  return visibleSkus.filter((sku) => selected.has(sku));
}

export function requiresConfirmWord(count: number): boolean {
  return count > CONFIRM_WORD_THRESHOLD;
}

/** El botón Confirmar se habilita si no se exige la palabra o si se escribió exacta. */
export function canConfirmDelete(count: number, typed: string): boolean {
  return count > 0 && (!requiresConfirmWord(count) || typed.trim() === CONFIRM_WORD);
}

/** Nombres a listar en el diálogo y cuántos quedan fuera ("y N más"). */
export function namesPreview(names: readonly string[]): { shown: string[]; more: number } {
  return { shown: names.slice(0, MAX_NAMES_LISTED), more: Math.max(0, names.length - MAX_NAMES_LISTED) };
}
