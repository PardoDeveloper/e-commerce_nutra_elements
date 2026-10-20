# Cloud Functions de Nutra Elements

TypeScript estricto, Cloud Functions de 2ª generación, región `us-east4`, Node 24.
Contrato: `docs/team/contracts/functions.md`.

## Comandos (desde `functions/`)

- `npm install`
- `npm run build` — compila a `lib/` (no versionado).
- `npm run lint` — ESLint.
- `npm test` — tests unitarios con Vitest, sin emulador.

## Tests que requieren emuladores

`npm run test:rules` y `npm run test:emulator` están definidos pero **requieren emuladores; sin ejecutar por D-026**. Fallan a propósito con un mensaje hasta que Carlos autorice los emuladores; entonces se conectarán con `firebase emulators:exec`. Convención de nombres: `*.rules.test.ts` y `*.emulator.test.ts` (excluidos de `npm test`).

## Secretos y variables

Ver `.env.example` (solo nombres). Los archivos `.env`, `.env.*` y `.secret.local` no se versionan. En la nube, los secretos van en Secret Manager.

## Tests de reglas de seguridad (2B.2)

- Ubicación: `functions/test/rules/` (`firestore.rules.test.ts`, `storage.rules.test.ts`). Usan `@firebase/rules-unit-testing` y leen `firestore.rules` y `storage.rules` de la raíz.
- `npm test` ejecuta solo los unitarios (proyecto `unit` de vitest) y **excluye** estos tests.
- `npm run test:rules` ejecuta el proyecto `rules`. Necesita los emuladores de Firestore y Storage; si no los detecta, falla con un mensaje claro. Ejemplo desde la raíz del repo:
  `firebase emulators:exec --only firestore,storage --project demo-nutra-rules "npm --prefix functions run test:rules"`
- `npm run typecheck:rules` comprueba los tipos de los tests sin emuladores.
- Estado: **sin ejecutar** (D-026: sin emuladores ni Java por ahora). Obligatorio ejecutarlos antes de producción.
