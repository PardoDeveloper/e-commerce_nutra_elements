// Genera src/data/catalog.local.json desde productos_nutra_elements.xls (raíz del repo).
// Uso: npm run demo:catalog
//
// - Solo toma ID (sku), nombre, precio y si hay stock (sí/no). NUNCA guarda la cantidad.
// - El resultado queda ignorado por git (D-017). Las reglas de nombre, slug y
//   categoría viven en src/lib/data/catalog-rules.ts (editar CATEGORY_RULES).
// - Usa SheetJS instalado desde su CDN oficial (devDependency).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { rowToProduct, categorize } from "../src/lib/data/catalog-rules.ts";

const SOURCE = new URL("../productos_nutra_elements.xls", import.meta.url);
const TARGET = new URL("../src/data/catalog.local.json", import.meta.url);

if (!existsSync(SOURCE)) {
  console.error("No se encontró productos_nutra_elements.xls en la raíz del repo.");
  process.exit(1);
}

const workbook = XLSX.read(readFileSync(fileURLToPath(SOURCE)));
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

const products = [];
const slugs = new Set();
const unmatched = [];
for (const row of rows) {
  const product = rowToProduct(row);
  if (!product) {
    console.warn("Fila omitida (ID, nombre o precio inválido).");
    continue;
  }
  if (slugs.has(product.slug)) product.slug = `${product.slug}-${product.sku}`;
  slugs.add(product.slug);
  if (!categorize(product.sourceName).matched) unmatched.push(product.sku);
  products.push(product);
}
products.sort((a, b) => a.name.localeCompare(b.name, "es"));

writeFileSync(TARGET, JSON.stringify({ generatedAt: new Date().toISOString(), products }, null, 2) + "\n");

const perCategory = {};
for (const p of products) perCategory[p.categoryId] = (perCategory[p.categoryId] ?? 0) + 1;
console.log(`Catálogo local: ${products.length} productos`);
console.log("Por categoría:", perCategory);
if (unmatched.length) console.warn("Sin regla de categoría (quedan en bienestar):", unmatched.join(", "));
