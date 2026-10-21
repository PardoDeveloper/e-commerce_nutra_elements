# QA: pedidos, pagos con Flow y métricas (qa-reviewer, 2026-10-20)

Volcado por el tech-lead: qa-reviewer no tiene herramienta de escritura. Es un resumen fiel del informe entregado.

## Veredicto: APROBADO para staging con Flow sandbox
- Sin hallazgos críticos. Aplica solo a staging, sin dinero real. Antes de Flow real hay que cerrar A1 y A2 y correr las pruebas contra Firestore real.
- Evidencia ejecutada por QA en `functions/`: `build`, `lint` y `typecheck:rules` sin errores; `npm test` con 33 archivos y 740 tests en verde.
- No se ejecutaron `test:rules` ni `concurrency.emulator.test.ts` (D-026).
- `functions/src/index.ts` aún no exporta `orders/` ni `payments/`.
- Sin secretos en el código (`git grep` sin imprimir valores).

## Altos
- **A1.** Un segundo pago de Flow pasa inadvertido si el pedido está en `payment_review` o `refunded` (`payments/apply-status.ts:94-114`). Corrección: comparar `status.flowOrder` con `order.flow.paidFlowOrder` en cualquier estado distinto de `pending_payment`, `expired` y `cancelled`; si difiere, anotar `DUPLICATE_PAYMENT` en `statusHistory` y `paymentEvents.warnings`, una sola vez. Bloquea el lanzamiento real, no el sandbox.
- **A2.** El token de acceso del pedido viaja en la `urlReturn` enviada a Flow (`payments/config.ts:97`). Antes de Flow real, usar un token de retorno de un solo uso o de vida corta, y `Referrer-Policy: no-referrer` en la página de retorno.

## Medios
- **M1.** `flowConfirm` es público y no tiene límite de uso (`payments/flow-confirm.ts:34-40`). Agregar un límite por IP o rechazo rápido de tokens con forma inválida.
- **M2.** `releaseExpiredReservations` procesa en serie, con espera de Flow de hasta 10 s por pedido (`orders/release-expired.ts`). Cortar tras 3 errores seguidos de Flow, o limitar la concurrencia.
- **M3.** Un reintento idempotente de `createOrder` rota el token y puede invalidar el que el cliente ya recibió (`orders/create-order.ts:76-87`).
- **M4.** `flowConfirm` exige la configuración completa de Flow, incluida `FLOW_CONFIRMATION_URL` y `SITE_URL`, y cachea un fallo de configuración como `null` para siempre (`payments/callables.ts:34`, `runtime.ts:66-77`).
- **M5.** La IP del cliente sale de la última entrada de `X-Forwarded-For`, sin comprobarla contra la infraestructura real (`orders/client-ip.ts`). Probar en staging desde dos redes. Subir `orderStatusPerIpPer10Min` a 120.
- **M6.** Desviaciones del contrato (`paidFlowOrder`, `ORDER_NOT_PAYABLE`, huella de idempotencia, guarda de ambiente): aceptables. `paidFlowOrder` va al contrato v1.4.

## Bajos
- B1: `recordManualRefund` no comprueba que `method` coincida con `paymentMethod`.
- B2: el límite por correo se evade con alias (`+x`, puntos).
- B3: las validaciones fallidas de `createOrder` no consumen el límite por IP.
- B4: el hash de IP de `rateLimits`, sin clave, es reversible por fuerza bruta (lo mitiga el TTL de 1 día).
- B5: la respuesta de `getStatus` de Flow no lleva firma (protegida por HTTPS).

## Lo que depende de Firestore real y NO está probado
Sobreventa y contador bajo concurrencia, contención del contador (`maxAttempts` 10), adaptador `firestore-db.ts` (Timestamp, `increment`, `create` duplicado), índices (`orders(paymentStatus, reservedUntil)`), tamaño de transacción con 20 líneas, reglas (`test:rules`), comportamiento de Flow sandbox (unicidad de `commerceOrder`, reintentos, retorno GET o POST, 401 de `getStatus`), secretos montados, `invoker: public`, App Check y Cloud Scheduler.

## Recomendaciones antes de desplegar a staging
1. Conectar los dos `export *` en `functions/src/index.ts`.
2. Cargar `FLOW_API_KEY` y `FLOW_SECRET_KEY` (sandbox).
3. Definir `APP_ENV=staging`, `FLOW_API_BASE=https://sandbox.flow.cl/api` y `SITE_URL`. Tras el primer despliegue, cargar `FLOW_CONFIRMATION_URL`.
4. Ejecutar los tests de emulador cuando Carlos autorice Java; si no, una prueba manual de dos compras simultáneas del último producto en staging.
5. Corregir A1, M1, M2 y M4 antes de la primera prueba de punta a punta con Flow. A2, antes de Flow real.
