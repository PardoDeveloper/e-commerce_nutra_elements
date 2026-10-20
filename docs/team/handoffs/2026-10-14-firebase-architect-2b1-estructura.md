# Handoff firebase-architect — 2B.1 Estructura base del backend

Fecha: 2026-10-14. Rama: develop. Sin commits (de eso se encarga devops).

## Qué hice
- Configuración de Firebase (`firebase.json`) con Firestore (us-east4, D-010), Storage, Functions (codebase `default`, predeploy con lint y build) y la sección `emulators` (auth 9099, functions 5001, firestore 8080, storage 9199, ui 4000, `singleProjectMode`). Solo configuración: **no se ejecutó ningún emulador**.
- `firestore.rules` y `storage.rules` con todo denegado (`allow read, write: if false;`). Las reales van en 2B.2.
- `firestore.indexes.json` vacío (`{"indexes":[],"fieldOverrides":[]}`). Los 9 índices compuestos de data-model.md sección 5 y el TTL de `idempotencyKeys` y `rateLimits` se escriben en 2B.2 (la sintaxis del TTL está por verificar).
- `/functions` en TypeScript estricto: build, lint y test unitario de humo en verde. Estructura de carpetas en `src/`: `common/`, `orders/`, `payments/`, `catalog/`, `metrics/`, `triggers/`, `admin/` (con un README de una línea cada una, sin lógica). `src/index.ts` solo exporta; `common/options.ts` fija `setGlobalOptions({ region: "us-east4", maxInstances: 10 })`.
- `.gitignore`: se agregaron `functions/.secret.local`, `functions/.env`, `functions/.env.*` y `!functions/.env.example`. `functions/lib/` ya estaba.

## Archivos (todos nuevos salvo .gitignore)
`firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `.gitignore` (modificado), `functions/package.json`, `functions/package-lock.json`, `functions/tsconfig.json`, `functions/tsconfig.build.json`, `functions/eslint.config.mjs`, `functions/vitest.config.mts`, `functions/.env.example`, `functions/README.md`, `functions/src/index.ts`, `functions/src/common/options.ts`, `functions/src/common/options.test.ts`, `functions/src/{orders,payments,catalog,metrics,triggers,admin}/README.md`.

## Versiones (fuente: `npm view` el 2026-10-14)
- firebase-functions 7.4.0, firebase-admin 14.5.0 (peer de functions lo admite), zod 4.6.7.
- Node 24.21.0 / npm 11.19.0 locales; firebase-tools 15.34.0.
- Dev: typescript 6.0.3 (ver decisión), eslint 10.12.0, @eslint/js 10.0.1, typescript-eslint 8.71.2, vitest 5.0.4, @types/node 24.x.
- **Node 24 soportado**: la página oficial de runtimes de Cloud Run functions (https://cloud.google.com/functions/docs/runtime-support) lista Node.js 24 (`nodejs24`, deprecación 2028-04-30). Además, firebase-tools 15.34.0 instalado lo define como GA (`lib/deploy/functions/runtimes/supported/types.js`). Nota: no encontré una frase explícita sobre nodejs24 en las páginas de docs de Firebase (get-started y manage-functions solo mencionan 20 y 22 en el ejemplo de `runtime`), por lo que la confirmación se apoya en esas dos fuentes. Conviene repetir la comprobación al primer deploy real.

## Decisiones
- **Vitest** en vez de Jest: soporta TypeScript y ESM sin configuración extra y es más rápido; requiere Node >=22, compatible.
- **TypeScript 6.0.3 y no 7.0.2** (la última): typescript-eslint 8.71.2 declara el peer `typescript <6.1.0`; usar 7 rompería el lint.
- **zod** (dependencia pequeña y estándar): validación de entrada en callables (contrato sección 1, `INVALID_INPUT`). Es la única dependencia de runtime agregada.
- `moduleResolution: NodeNext` con importaciones `.js` en el código fuente.
- `test:rules` y `test:emulator` fallan a propósito (`exit 1`) con el mensaje "Requiere emuladores; sin ejecutar por D-026", para que nadie los dé por pasados. Convención: `*.rules.test.ts` y `*.emulator.test.ts`, excluidos de `npm test`.
- Predeploy ejecuta lint y build. `firebase.json` ignora `.env*`, `*.local` y `src` en el paquete desplegado.
- Ubicación de los `.env` del emulador de Functions: `functions/.env` y `functions/.env.<alias>` (esto cierra el pendiente de la sección 7.1 del contrato; no requiere cambio del contrato, solo confirmarlo). `functions/.env.example` solo tiene nombres.

## Verificaciones (en `functions/`)
- `npm install`: OK (aviso informativo de npm sobre scripts de instalación de `@firebase/util` y `protobufjs`; no bloquea).
- `npm run build`: OK, sin errores; genera `lib/index.js`.
- `npm run lint`: OK, sin avisos.
- `npm test`: 1 archivo, 1 test, pasa.
- `git status --short`: no aparecen `.env`, `node_modules`, `lib/` ni datos. `git check-ignore` confirma ignorados `functions/.env`, `functions/.secret.local`, `functions/lib`, `functions/node_modules`; `functions/.env.example` no está ignorado.

## Sin verificar
- Que los emuladores levanten con esta configuración (D-026; no se ejecutaron ni se instaló Java).
- Que `firebase.json` pase la validación del CLI en un deploy (no se hizo deploy). El campo `location` dentro de `firestore` no lo pude confirmar contra el esquema oficial; si el CLI lo rechaza, se quita y la ubicación se fija al crear la base (D-010).
- Reglas: solo se comprobó por lectura que niegan todo; no hay tests de reglas aún (2B.2).

## Qué necesito de otros
- tech-lead: nada bloqueante. Propuesta (opcional): decidir si `maxInstances` global 10 se mantiene, ya que el contrato lo pide así.
- devops: al commitear, revisar que `functions/package-lock.json` entre y que `git check-ignore` siga confirmando lo anterior.
