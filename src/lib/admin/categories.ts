// Reglas puras de las categorías del admin (D-040), compartidas por la demo y Firebase.
// Calcan `validCategory` de firestore.rules: nombre de 1 a 80 caracteres, slug (= ID) de hasta 60 y order 0..9999.
import { slugify } from "@/lib/slug";
import { AdminServiceError } from "./errors";
import type { AdminCategory } from "./types";

export const MAX_CATEGORY_NAME = 80;
export const MAX_CATEGORY_SLUG = 60;
const MAX_ORDER = 9999;

/** Nombre limpio y válido, o lanza INVALID_NAME. */
export function cleanCategoryName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > MAX_CATEGORY_NAME) {
    throw new AdminServiceError("INVALID_NAME", `El nombre de la categoría debe tener entre 1 y ${MAX_CATEGORY_NAME} caracteres.`);
  }
  return trimmed;
}

/** Slug de una categoría nueva a partir del nombre. Lanza si queda vacío o si ya existe. */
export function newCategorySlug(name: string, existing: readonly AdminCategory[]): string {
  const slug = slugify(name, MAX_CATEGORY_SLUG);
  if (slug === "") throw new AdminServiceError("INVALID_NAME", "El nombre debe tener al menos una letra o un número.");
  if (existing.some((c) => c.slug === slug)) throw new AdminServiceError("CATEGORY_EXISTS", "Ya existe una categoría con ese nombre.");
  return slug;
}

/**
 * Slug al renombrar: siempre sale del nombre nuevo (D-040). Puede ser el mismo (solo cambian mayúsculas o tildes).
 * Lanza si queda vacío o si otra categoría ya lo usa.
 */
export function renamedCategorySlug(currentSlug: string, name: string, existing: readonly AdminCategory[]): string {
  const slug = slugify(name, MAX_CATEGORY_SLUG);
  if (slug === "") throw new AdminServiceError("INVALID_NAME", "El nombre debe tener al menos una letra o un número.");
  if (slug !== currentSlug && existing.some((c) => c.slug === slug)) throw new AdminServiceError("CATEGORY_EXISTS", "Ya existe una categoría con ese nombre.");
  return slug;
}

/** Orden de una categoría nueva: al final de la lista (de 10 en 10, como las iniciales). */
export function nextCategoryOrder(existing: readonly AdminCategory[]): number {
  const max = existing.reduce((m, c) => Math.max(m, c.order), 0);
  return Math.min(MAX_ORDER, max + 10);
}

export function sortCategories(list: readonly AdminCategory[]): AdminCategory[] {
  return [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "es"));
}

/** Nombre de una categoría por slug (o el slug si ya no existe). */
export function categoryName(categories: readonly AdminCategory[], slug: string | null): string | null {
  if (slug === null) return null;
  return categories.find((c) => c.slug === slug)?.name ?? slug;
}
