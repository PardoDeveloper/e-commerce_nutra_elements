# Correcciones del QA de pedidos y pagos (firebase-architect, 2026-10-20)

## Resultado
`functions/`: `npm run build`, `npm run lint` y `npm run typecheck:rules` sin errores; `npm test`: 34 archivos, 756 tests en verde (antes 33 y 740). Sin emuladores, sin despliegue, sin git (D-026).

## Qué cambió
| Hallazgo | Cambio | Test que falla sin el arreglo |
|---|---|---|
| A1 | `payments/apply-status.ts`: segundo pago en cualquier estado salvo `pending_payment`, `expired` y `cancelled`, comparando `status.flowOrder` con `flow.paidFlowOrder`. Anota `DUPLICATE_PAYMENT` una vez por token en `statusHistory` (con el estado real en `from`/`to`) y en `paymentEvents.warnings`. | `flow-confirm.test.ts`: payment_review y refunded, 3 reintentos, una sola anotación; mismo `flowOrder` no es duplicado. |
| M1 | `payments/flow-confirm.ts`: límite por IP con `consumeRateLimit` (clave `flowConfirm:<sha256(ip)>`), 429 sin llamar a Flow. Token con forma inválida: 400 antes de leer Firestore y sin consumir el límite. `limits.flowConfirmPerIpPer10Min` (1..10000, por defecto 300). `callables.ts` pasa la IP con `clientIpFrom`. | `flow-confirm.test.ts` (4 tests nuevos). |
| M2 | `orders/release-expired.ts`: corta el ciclo tras `MAX_CONSECUTIVE_FLOW_ERRORS` (3) errores seguidos de Flow; un resultado sin error reinicia la cuenta. El resumen agrega `abortedByFlow: {remaining}` solo si ocurre. | `release-expired.test.ts` (2 tests nuevos). |
| M3 | Ver decisión abajo. | `create-order.test.ts`, `primitives.test.ts`. |
| M4 | `payments/runtime.ts`: `makeApiClientProvider` cachea solo el éxito; `requireFlowApiClient` para `flowConfirm`, que ya no usa `getFlowRuntime()` (sin `FLOW_CONFIRMATION_URL` ni `SITE_URL`). | `payments/runtime.test.ts` (nuevo, 4 tests). |
| Límite 120 | `DEFAULT_LIMITS.orderStatusPerIpPer10Min = 120`, siembra `catalog/seed.ts` y fixture de tests. | `get-order-status.test.ts`: con `limits` ausente, 120 pasan y la 121 da `RATE_LIMITED`. |
| B1 (hecho) | `recordManualRefund`: `method: "flow"` solo si el pedido se pagó con Flow (`INVALID_INPUT` si no). El caso contrario (Flow devuelto por transferencia) sigue válido. | `admin-orders.test.ts`. |
| Conexión | `functions/src/index.ts` exporta `orders/index.js` y `payments/index.js`. Cargué `lib/index.js` tras el build: 28 exportaciones, sin nombres duplicados con catalog, admin ni triggers. | |
| Contratos | `data-model.md` y `functions.md` en v1.4: `paidFlowOrder`, desviaciones aceptadas de D-032, límites, 429, token derivado, corte M2 y B1. | |

## Decisión M3 (token en el reintento idempotente)
Problema: solo se guarda el hash del token, así que el servidor no puede devolver el mismo token y rotarlo invalidaba el que el cliente ya tenía. Solución elegida: el token se **deriva** del `clientRequestId` (`base64url(sha256("nutra-elements:order-access-token:v1:" + id))`, 43 caracteres). El reintento devuelve el mismo token y no escribe nada. Seguridad: el `clientRequestId` es un UUID v4 (validado por el esquema) que solo conoce el navegador y que en Firestore queda como `sha256(id)`, que no permite obtener el token (otro prefijo). Costo: 122 bits de entropía en vez de 256. Alternativas descartadas: guardar el token cifrado (necesita clave en Secret Manager) o aceptar varios hashes por pedido (cambia el modelo y las reglas).

## Qué quedó sin hacer
- **A2** (token de retorno de un solo uso en la `urlReturn` y `Referrer-Policy: no-referrer`): pendiente antes de Flow real; es una decisión de producto.
- B2 a B5 y M5 (probar la IP en staging desde dos redes): sin cambios.

## Qué necesito de otros agentes (pedir al tech-lead)
1. **`firestore.rules` (`validLimits`)** usa `hasOnly` con 4 claves: no admite `flowConfirmPerIpPer10Min`. El código funciona sin esa clave (usa 300), pero si se quiere configurar desde el admin hay que agregarla a las reglas y a su test, y a `SeedSettingsPrivate`. No la sembré para no romper las reglas actuales.
2. **Frontend (`src/lib/admin/firebase-mappers.ts` y `firebase-seed.test.ts`)** todavía tiene `orderStatusPerIpPer10Min: 30` como valor por defecto: alinear a 120. `functions/test/rules/firestore.rules.test.ts` también usa 30 en su fixture (solo prueba la forma; no necesita cambio).
3. **Frontend**: tras `createOrder` se puede guardar el token; un reintento con el mismo `clientRequestId` devuelve el mismo, ya no hace falta descartar el primero.
4. El `flowConfirm` ahora responde 429 al superar el límite; Flow reintenta. Con 300 por 10 min no debería ocurrir con tráfico real.

## Sigue sin verificar contra Firestore y Flow reales
- Todo lo del informe de QA: sobreventa y contador bajo concurrencia, adaptador `firestore-db.ts`, índices, tamaño de transacciones, reglas (`test:rules`), `concurrency.emulator.test.ts` (no ejecutados, D-026).
- Flow sandbox: unicidad de `commerceOrder`, reintentos de confirmación, retorno GET o POST, 401 de `getStatus`, y el formato real del token (el rechazo rápido usa `^[A-Za-z0-9._-]{1,100}$`; no lo ajusté porque la longitud del token de Flow no está confirmada).
- La IP del cliente (última entrada de `X-Forwarded-For`): probar en staging. En `flowConfirm` la IP será casi siempre la de Flow; por eso el límite es holgado.
- Los tests de M1, M2 y M4 usan Firestore en memoria y Flow simulado: validan la lógica, no el comportamiento real.
- El valor `DUPLICATE_PAYMENT` depende de que Flow devuelva un `flowOrder` distinto por cada cobro (supuesto, sin verificar).
- Un pedido con reintento idempotente cuyo hash no coincida con el derivado (creado con el esquema anterior) da `INTERNAL`; no existen pedidos así fuera de pruebas locales (limpiar los de prueba, D-030).
