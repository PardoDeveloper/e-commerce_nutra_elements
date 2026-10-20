# Handoff firebase-architect: contratos v1.3 y arreglo de AuthRequestLike (2026-10-19)

Sin emuladores, sin deploy y sin git. No se tocaron reglas, índices ni `src/`.

## Contratos (v1.3 — D-032 aplicada)
- `contracts/functions.md`: encabezado; `changes`/`PlannedChange` en `BatchReport`; bloque de extensiones aditivas, auditoría con `PARTIAL_FAILURE`, números estrictos, slug único entre vigentes y lista completa de códigos de fila (sección 5); firmas definitivas de `createProduct` y `updateProductCommerce` (`price`/`stock` son `Cell`; `stock` de la respuesta es el disponible; `discountRemoved`); `imports.kind` `create`/`update`; nueva 5.8b `claimAdmin` y el primer admin ya no es por script (5.8); `ADMIN_EMAILS` en 7.1; reintento acotado en 8.1; nota de que el admin edita el contenido de un producto eliminado.
- `contracts/data-model.md`: encabezado; `imports.kind` con `create` y `update` (2.7); advertencias `BARCODE_TOO_LONG` y `PARTIAL_FAILURE`; nota del admin sobre productos eliminados (2.1).
- Las demás firmas del handoff 2B.6 ya coincidían con el contrato.

## Código
- `functions/src/common/auth.ts`: `token?: { admin?: unknown; [claim: string]: unknown }`. `assertAdmin` sigue con `admin === true` estricto.
- Eliminados `authOf` en `admin/callables.ts` y `catalog/callables.ts`; ambos pasan `request` directo.

## Verificación (en `functions/`)
- `npm run build`: OK. `npm run lint`: OK.
- `npm test`: 16 archivos, 441 tests, todos pasan.
- `npm run typecheck:rules`: OK, sin errores.

## Para otros
- nextjs-frontend: leer 5.8b (login -> `claimAdmin` -> `getIdToken(true)`) y `changes` / `discountRemoved`.
- Sigue sin verificar contra emulador (D-026): `firestore-store.ts`, `claimAdmin` con Auth real, triggers de punta a punta.
