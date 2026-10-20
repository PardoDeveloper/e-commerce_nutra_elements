# Handoff: firebase-architect, correcciones de QA en reglas (2026-10-19)

Origen: 2026-10-19-qa-reviewer-reglas-prod.md (mejoras IMPORTANTE 1 y 2, y sugerencia 3).

## Cambios
1. `storage.rules`: `allow read: if true` pasa a `allow get: if true` en `products/{sku}/{file}` y `categories/{slug}/{file}`. Ya nadie puede listar archivos; el admin tampoco, porque no existe regla `list` y el resto cae en el `deny` general.
   - Test (`functions/test/rules/storage.rules.test.ts`): nuevo caso `list` sobre `products/2427831` y `categories/magnesio` falla para anonymous, user y admin. Se decidió que el admin también falla (las reglas no le dan `list`); si la UI admin necesita listar, hay que pedirlo al tech-lead (se guarda la ruta en Firestore, no hace falta).
2. `functions/test/rules/firestore.rules.test.ts`: se quitaron `["deletedAt", null]` y `["deletedBy", null]` del `it.each` (sobre `2427831` no cambiaban `affectedKeys`). Nuevo test sobre `P-DELETED` (valores no nulos): poner `deletedAt`, `deletedBy` o ambos en null falla.
3. `isAdmin()` en ambos archivos usa `request.auth.token.get('admin', false) == true`. Semántica: igual para concederle acceso al admin (solo `true` booleano). Si falta el claim, antes la evaluación daba error (denegación) y ahora da `false` (denegación): el resultado es el mismo en todos los usos actuales, porque `isAdmin()` solo aparece en condiciones positivas o con `||`, y no hay `!isAdmin()`. Evita errores de evaluación ruidosos. El caso de test `admin: "true"` (cadena) sigue denegado.

## Verificación (en `functions/`, sin emuladores: D-026/D-031)
- `npm run lint`: verde.
- `npm test` (proyecto unit): 10 archivos, 239 tests, verde.
- `npm run typecheck:rules`: FALLA con 2 errores TS2345 en `functions/src/catalog/runner.ts` (líneas 73 y 84, `BatchJob<T>` vs `BatchJob<unknown>`). No son de mis archivos; es código de `functions/src/**` que está tocando otro agente. Mis tests no reportan errores de tipos.
- Los tests de reglas (`npm run test:rules`) NO se ejecutaron: requieren emuladores.

## Pedido al tech-lead
- Que el agente dueño de `functions/src/catalog/runner.ts` corrija la varianza de `BatchJob<T>` para dejar `typecheck:rules` en verde.
