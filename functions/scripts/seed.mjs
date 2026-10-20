/* global process, console */
// Siembra de datos iniciales (categorías y settings). NO se ejecuta automáticamente.
//
// Uso (después de `npm run build`, con credenciales de aplicación del operador):
//   node scripts/seed.mjs --project nutraelements            # simulación: solo muestra qué crearía
//   node scripts/seed.mjs --project nutraelements --apply    # escribe
//
// Seguridad:
//  - Exige --project explícito (no usa el proyecto por defecto) y no corre contra emuladores.
//  - Usa create(): jamás pisa documentos existentes (si ya existen, los salta). Es repetible.
//  - Los datos bancarios son de prueba; se reemplazan desde el panel de administración.
//  - Escribir en el proyecto real lo confirma Carlos antes (D-030).
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { buildSeedData } from "../lib/catalog/seed.js";

const args = process.argv.slice(2);
const projectIdx = args.indexOf("--project");
const projectId = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
const apply = args.includes("--apply");

if (!projectId || projectId.startsWith("--")) {
  console.error("Falta --project <id>. Ejemplo: node scripts/seed.mjs --project nutraelements");
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST está definido: este script es para el proyecto real (D-026).");
  process.exit(1);
}

const data = buildSeedData();
const now = FieldValue.serverTimestamp();
const docs = [
  ...data.categories.map((c) => ({ path: `categories/${c.slug}`, data: { ...c, createdAt: now, updatedAt: now } })),
  { path: "settings/public", data: { ...data.settingsPublic, updatedAt: now } },
  { path: "settings/private", data: { ...data.settingsPrivate, updatedAt: now } },
];

console.log(`Proyecto: ${projectId} | modo: ${apply ? "ESCRIBIR" : "simulación"}`);
if (!apply) {
  for (const d of docs) console.log(`  crearía ${d.path}`);
  console.log("Agrega --apply para escribir.");
  process.exit(0);
}

initializeApp({ projectId });
const db = getFirestore();
let created = 0;
let skipped = 0;
for (const d of docs) {
  try {
    await db.doc(d.path).create(d.data);
    created++;
    console.log(`  creado ${d.path}`);
  } catch (err) {
    // Código gRPC 6 = ALREADY_EXISTS
    if (err && err.code === 6) {
      skipped++;
      console.log(`  ya existe, se omite ${d.path}`);
    } else {
      throw err;
    }
  }
}
console.log(`Listo: ${created} creados, ${skipped} omitidos.`);
