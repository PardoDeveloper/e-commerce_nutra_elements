// Se ejecuta antes de cada archivo de tests de reglas (setupFiles de vitest).
// Falla con un mensaje claro si no hay emuladores: así nadie da por pasados tests que no corrieron (D-026).
const required = ["FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"] as const;
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(
    [
      "Los tests de reglas requieren los emuladores de Firestore y Storage, y no se detectaron.",
      `Variables ausentes: ${missing.join(", ")}.`,
      "Ejecútalos con emuladores, por ejemplo desde la raíz del repo:",
      '  firebase emulators:exec --only firestore,storage --project demo-nutra-rules "npm --prefix functions run test:rules"',
      "(Sin ejecutar mientras D-026 siga vigente: requiere autorización de Carlos y Java instalado.)",
    ].join("\n"),
  );
}
