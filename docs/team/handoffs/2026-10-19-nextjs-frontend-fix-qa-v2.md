# Handoff nextjs-frontend: fixes del QA v2 (2026-10-19)

## Qué hice
1. RUT de prueba del seed: ahora `PRUEBA-0` (`holderRut` solo exige texto de 1 a 100 caracteres en `validBank`; no se valida como RUT). Test actualizado.
2. Datos bancarios de prueba:
   - Nuevo `src/lib/bank.ts`: constantes `TEST_BANK_NAME`, `TEST_BANK_HOLDER_RUT` (compartidas con el seed), `isTestBank(bank)` e `isTransferOffered(source, bank)`.
   - `SettingsView`: el aviso "Son datos de prueba" solo sale si `isTestBank(bank)`; si no, una ayuda neutra.
   - Checkout: `loadCheckoutData` entrega `transferAvailable`; `CheckoutForm` oculta "Transferencia bancaria" cuando es falso y muestra una nota discreta. En demo se mantiene como antes.
3. `INITIAL_CATEGORIES_TOTAL = buildInitialCategories().length`.

## Archivos
src/lib/bank.ts, src/lib/bank.test.ts, src/lib/admin/firebase-seed.ts (+ test), src/components/admin/SettingsView.tsx, src/lib/checkout/server.ts, src/app/checkout/page.tsx, src/components/checkout/CheckoutForm.tsx.

## Decisión importante
`settings/private` no es legible con las reglas públicas con las que el servidor de Next lee Firestore. Por eso, con fuente firebase, el checkout trata el banco como "sin datos" y NO ofrece transferencia hasta que haya un canal para saberlo.

## Pedido al tech-lead
Cuando se integre el checkout real con Cloud Functions, se necesita que `createOrder`/una función (o un campo público booleano, p. ej. `settings/public.transferEnabled` escrito por la función al guardar un banco real) informe si hay banco real configurado; entonces `loadCheckoutData` pasa ese dato a `isTransferOffered`. Sin eso, en firebase la transferencia queda siempre oculta. Requiere cambio de contrato (firebase-architect).
Nota: `src/lib/admin/seed.ts` (demo) conserva el RUT `11.111.111-1`; es solo demo.

## Verificación
`npm run lint`, `npm test` (313 pasan) y `npm run build` en verde.
