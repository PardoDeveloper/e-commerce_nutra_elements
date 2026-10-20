import { defineConfig } from "vitest/config";

// Dos proyectos separados:
//  - unit: tests unitarios sin emulador (npm test). Excluye *.rules.test.ts y *.emulator.test.ts.
//  - rules: tests de reglas de seguridad (npm run test:rules). Requieren los emuladores de Firestore y Storage.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.rules.test.ts", "src/**/*.emulator.test.ts", "node_modules/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "rules",
          include: ["test/rules/**/*.rules.test.ts"],
          environment: "node",
          setupFiles: ["test/rules/require-emulators.ts"],
          // Comparten emulador y proyecto: se ejecutan en serie para no pisarse.
          fileParallelism: false,
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
