// Slug para URL a partir de un nombre: sin tildes, en minúsculas y con guiones en lugar de espacios
// (cumple `^[a-z0-9]+(-[a-z0-9]+)*$` de las reglas de Firestore). Lo usan productos y categorías del admin.

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Citrato de Magnesio 120 Cápsulas" -> "citrato-de-magnesio-120-capsulas". */
export function slugify(text: string, maxLength = 80): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}
