# Handoff firebase-architect: reglas v1.4.1 (2026-10-20)

## Qué hice
1. `firestore.rules`, `validLimits`: se admite `flowConfirmPerIpPer10Min` (entero 1..10000, opcional) en el `hasOnly`. Las demás claves coinciden con el contrato: `createOrderPerIpPer10Min` 1..100, `pendingOrdersPerEmail` 1..50, `orderStatusPerIpPer10Min` 1..1000 (ya cubría el mínimo de 120), `orderStatusFailuresPerOrder` 1..100.
2. `storage.rules`: `products/...` y `categories/...` pasan de `create, update` a solo `create`; `delete` sigue siendo admin. Resuelve el hallazgo B1 del QA.
3. Tests nuevos:
   - `functions/test/rules/firestore.rules.test.ts`: `flowConfirmPerIpPer10Min` 1, 300 y 10000 permitidos; 0, 10001, 1.5 y "300" rechazados; `orderStatusPerIpPer10Min` 120 y 1000 permitidos, 1001 rechazado.
   - `functions/test/rules/storage.rules.test.ts`: el admin no puede sobrescribir una imagen existente (producto ni categoría).
4. Contrato `data-model.md` pasa a v1.4.1 (cabecera, sección `limits` y tabla de Storage).
5. `seed.ts` no se tocó: la clave es opcional y no se siembra.

## Verificación
En `functions/`: `npm run build` OK, `npm run lint` OK, `npm test` 34 archivos / 756 tests OK, `npm run typecheck:rules` OK.

## Importante
- Las reglas **no se ejecutaron**: no hay Java, así que los tests de reglas solo pasaron el typecheck. Hay que correrlos con el emulador donde haya Java (D-026) antes del despliegue.
- **No se desplegó nada**. La nueva versión de `firestore.rules` y `storage.rules` se despliega aparte, con la confirmación de Carlos.

## Archivos cambiados
`firestore.rules`, `storage.rules`, `functions/test/rules/firestore.rules.test.ts`, `functions/test/rules/storage.rules.test.ts`, `docs/team/contracts/data-model.md`.

## Necesito del tech-lead
- Que devops ejecute los tests de reglas con emulador y despliegue las reglas con confirmación de Carlos.
