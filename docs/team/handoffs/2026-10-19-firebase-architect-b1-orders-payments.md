# Handoff — B1: funciones de pedidos, pagos y métricas (firebase-architect)

Fecha: 2026-10-19/20. Tarea: `docs/team/tasks/B1-orders-payments.md`. Proyecto de trabajo: `nutraelements` (D-030/D-031).
No se desplegó nada, no se usaron emuladores ni Java, no se tocó git, ni `.env*`, ni el `.xls`.

## Estado

En `functions/` (verificado al final):
- `npm run build`: sin errores.
- `npm run lint`: sin errores.
- `npm run typecheck:rules` (compila también todos los tests): sin errores.
- `npm test`: **33 archivos, 740 tests, todos en verde**. De ellos, **293 tests / 16 archivos son míos** (orders, payments y el doble de Firestore); el resto es `common/`, `catalog/`, `admin/` y `triggers/`.

## Funciones y archivos

Todas con `region us-east4` (por `setGlobalOptions`), timeouts y `maxInstances` de la tabla del contrato (lo comprueba `orders/callables.test.ts`). Los callables públicos y de admin usan `callableSecurityOptions()`.

| Función | Tipo | Archivos |
|---|---|---|
| `createOrder` | callable público | `orders/create-order.ts`, `create-plan.ts` |
| `getOrderStatus` | callable público (con reconciliación a Flow) | `orders/get-order-status.ts`, `public-view.ts` |
| `createFlowPayment` | callable público | `payments/create-payment.ts` |
| `flowConfirm` | HTTP (`onRequest`, `invoker: public`) | `payments/flow-confirm.ts`, `apply-status.ts` |
| `confirmTransferPayment`, `resolvePaymentReview`, `cancelOrder`, `updateFulfillment`, `recordManualRefund` | callables admin | `orders/admin-orders.ts` |
| `releaseExpiredReservations` | programada cada 5 min, `America/Santiago` | `orders/release-expired.ts` |

Lógica pura (testeada a fondo): `orders/payment-plan.ts` (transiciones de pago), `fulfillment-plan.ts`, `refund-plan.ts` (D-025), `stock.ts` (delta de stock), `create-plan.ts` (snapshot, huella de idempotencia), `primitives.ts` (token, número de pedido, ventana de límites), `public-view.ts` (lista blanca de campos), `settings.ts`, `schemas.ts`, `client-ip.ts`.
Capa transaccional fina: `orders/tx.ts`, `apply-plan.ts`; métricas en `metrics/apply.ts` (usa `common/metrics.ts`, sin cambios).
Cableado: `orders/callables.ts`, `payments/callables.ts`, `payments/runtime.ts` (secretos, cliente de Flow, hooks de reconciliación). Barrels: `orders/index.ts`, `payments/index.ts`, `metrics/index.ts`.

**Para el tech-lead — conectar en `functions/src/index.ts`** (no lo toqué):
```ts
export * from "./orders/index.js";
export * from "./payments/index.js";
```

### Cambios en `common/` (todos aditivos, archivos nuevos; no se modificó ningún archivo existente)
- `common/db.ts`: puerto mínimo de Firestore (`Db`, `Tx`, `increment`, `Clock`, rutas).
- `common/firestore-db.ts`: adaptador con el Admin SDK (`maxAttempts: 10` en las transacciones por el contador caliente).
- `common/testing/memory-db.ts` (+ test): doble en memoria. Excluido del build.

Fuera de mis carpetas solo creé esos tres archivos y borré los `README.md` placeholder de `orders/`, `payments/` y `metrics/`.

## API de Flow verificada (fuente oficial)

Fuentes leídas el 2026-10-19: https://developers.flow.cl/api (referencia) y la especificación OpenAPI que la alimenta, https://developers.flow.cl/es-openApiFlow.yaml. La página antigua https://www.flow.cl/docs/api.html carga su propia copia (`apiFlow.yaml`), que descargué pero no comparé línea a línea; todo lo citado abajo sale de la referencia nueva.

Confirmado en la documentación:
- Bases: producción `https://www.flow.cl/api`, sandbox `https://sandbox.flow.cl/api`.
- **`POST /payment/create`**, `application/x-www-form-urlencoded`. Obligatorios: `apiKey`, `commerceOrder`, `subject`, `amount`, `email`, `urlConfirmation`, `urlReturn`, `s`. Opcionales: `currency`, `paymentMethod`, `optional`, `timeout` (segundos hasta que la orden expira en Flow), `checkout_timeout`, entre otros. Respuesta 200: `{url, token, flowOrder}`; el pagador va a `url + "?token=" + token`. Errores: 400 (error del API) y 401 (error de negocio), cuerpo `{code, message}`.
- **`GET /payment/getStatus?apiKey&token&s`**. Respuesta: `flowOrder`, `commerceOrder`, `status`, `amount`, `currency`, `payer`, `paymentData`, etc. **`status`: 1 pendiente de pago, 2 pagada, 3 rechazada, 4 anulada.**
- **Firma `s`**: todos los parámetros menos `s`, ordenados alfabéticamente por nombre, concatenados como `nombre+valor` sin separadores, `HMAC-SHA256` con la `secretKey` (hexadecimal). El ejemplo oficial `amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP` está en los tests; el HMAC esperado se calculó aparte con Python (no con este código).
- **Confirmación**: Flow llama a `urlConfirmation` con `POST`, `application/x-www-form-urlencoded` y un `token`; el comercio debe invocar `payment/getStatus` con ese token. Es lo que hace `flowConfirm`.
- La referencia confirma que `currency` es opcional; se envía `CLP`.

**No está en la documentación y NO se pudo verificar** (se diseñó para que funcione en cualquiera de los casos):
1. Si `commerceOrder` debe ser único por orden de Flow. Por eso el primer intento usa `NE-000123` y los siguientes `NE-000123-2`, `-3`... (`flowConfirm` quita el sufijo y exige que no supere `flow.attempt`).
2. La política de reintentos de Flow cuando `urlConfirmation` responde error (por eso se responde 500 solo ante fallos transitorios y 400 cuando reintentar no ayuda).
3. Si el retorno del navegador a `urlReturn` es `GET` o `POST`: la ruta `/checkout/retorno` debe aceptar ambos (ya está en el contrato).
4. Cómo se comporta el parámetro `timeout` en el sandbox (se envía igual a la reserva restante, mínimo 60 s). Si diera problemas, quitar `timeoutSeconds` en `payments/create-payment.ts`.
5. Si un 401 de `getStatus` significa "token inexistente" o "credenciales malas": se tratan igual (ver abajo).
6. Todo lo anterior contra el **sandbox real**: no se hizo ninguna llamada real a Flow.

Guarda de ambiente (`payments/config.ts`): `APP_ENV` ∈ `local|staging|production`; en `local` y `staging` solo se acepta `https://sandbox.flow.cl/api`, y en `production` solo `https://www.flow.cl/api`; si no coincide, no se llama a Flow (`FLOW_UNAVAILABLE` / 500). Se evalúa **al primer uso**, no al cargar el módulo (durante el análisis del despliegue los valores aún no existen). Con D-031 (prod en modo staging) debe ser `APP_ENV=staging`.

## Decisiones de diseño que conviene conocer

- **Una sola rutina de pago** (`payments/apply-status.ts`) para `flowConfirm`, la reconciliación de `getOrderStatus` y la expiración. Valida monto (`Number(amount) === order.total`), moneda `CLP` y `commerceOrder` contra `getStatus` firmado; nunca usa el cuerpo salvo el token. La transición a `paid` depende del estado leído dentro de la transacción.
- **Estados de pago fuera de la tabla**: monto/moneda distintos tiene prioridad sobre `NO_STOCK`/`PAID_AFTER_CANCEL`. Un pedido `payment_review` o `refunded` que recibe otro pago queda sin cambios.
- **Segundo pago del mismo pedido**: se detecta con un campo adicional **`order.flow.paidFlowOrder`** (no está en el contrato; ver inconsistencias). Se anota una sola vez en `statusHistory` (`DUPLICATE_PAYMENT`) y en `paymentEvents.warnings`. Limitación: si el primer pago cayó en `payment_review` y llega otro, no se detecta como duplicado.
- **Límites anti-abuso**: el límite por IP de `createOrder` se consume solo al crear el pedido (dentro de la misma transacción); el de pendientes por correo se consulta fuera de la transacción y no se aplica a un reintento idempotente. Sin IP válida no se aplica el límite por IP (y se registra), para no bloquear a todos con una clave común.
- **IP del cliente**: última entrada de `X-Forwarded-For` (las anteriores las puede inventar el cliente). **No verificado** contra la infraestructura real.
- **`getOrderStatus`**: un token **correcto** nunca se bloquea por el límite de fallos por número (si no, cualquiera podría dejar sin estado a un cliente repitiendo fallos sobre su número, que es secuencial). Los tokens incorrectos sí reciben `RATE_LIMITED` pasado el máximo.
- **Idempotencia de `createOrder`**: la huella incluye carrito, medio de pago, RUT, correo y entrega (más estricta que el contrato, que pide carrito y RUT) para no devolver un pedido con otra dirección sin avisar. Si el pedido ya no está `pending_payment`, el reintento da `ORDER_NOT_PAYABLE` (no está en el contrato) y no rota el token.
- **`releaseExpiredReservations`**: antes de expirar un pedido de Flow con `flow.token` consulta `getStatus`; si está pagado aplica el pago. Si Flow falla (red, 400/401) **espera hasta 60 min después del vencimiento** y luego expira igual (un pago tardío se recupera como en `flowConfirm`). Así una caída de Flow no deja stock bloqueado para siempre ni expira un pedido que podría estar pagado.
- **Reembolso**: se valida monto y fecha antes de leer productos. Un producto inexistente al reponer stock se omite y se registra (no se crean documentos fantasma); un producto eliminado (D-029) recupera stock sin revivirse.
- **Logs**: solo `orderNumber`, montos, códigos y estados. Hay tests que espían el logger y comprueban que no aparecen RUT, correo, teléfono, dirección, token de acceso, token de Flow ni IP.

## Qué cubren los tests (todos unitarios, `npm test`)

- Lógica pura: matriz completa de transiciones de pago (permitidas y prohibidas, incluidas las que parten de `refunded`), logística (adelante, retroceso de un paso con motivo, `REASON_REQUIRED`, dos pasos, tipo de entrega), reembolso (total/parcial, con/sin reposición, día de `paidAt`, validación de monto y fecha), delta de stock, métricas, token/hash/número de pedido, ventanas de límites, vista pública con lista de campos prohibidos.
- Handlers con el **doble en memoria**: `createOrder` (precio manipulado, envío gratis, comunas, cantidades, `PRODUCT_UNAVAILABLE` incluido eliminado, RUT, idempotencia, límites, logs), `flowConfirm` (casos a–h del contrato 6 y más: duplicados, intentos con sufijo, orden desconocida, 405/400/500), `createFlowPayment`, `getOrderStatus` (misma respuesta para token malo e inexistente, límites, reconciliación cada 15 s), las 5 funciones admin (incluido 9b a–j), `releaseExpiredReservations` (con Flow simulado, Flow caído, lote de 100), y la configuración declarada de cada función (región, timeouts, secretos, cron).
- Autorización de los 5 callables admin con `.run(...)`: sin sesión, sin claim y admin.
- Firma de Flow con los ejemplos oficiales; cliente de Flow con `fetch` simulado (cuerpo, firma, errores 400/401/429/5xx, red caída sin filtrar la URL con credenciales, URL de pago solo https de `flow.cl`).

### Qué NO cubren / qué NO se pudo verificar

- **Firestore real**: las transacciones, `FieldValue.increment`, `create`/`update`, la consulta de vencidos (`paymentStatus` + `reservedUntil`), el conteo por correo (`customer.email` + `paymentStatus`, solo igualdades) y la conversión Timestamp/Date del adaptador (`common/firestore-db.ts`) **nunca se ejecutaron**. El doble modela: lecturas antes de escrituras, rechazo de `undefined`, `create` duplicado, `update` de inexistente, control optimista de versiones con reintento y los incrementos. **No** modela bloqueos reales, latencia, límites de tamaño de transacción, índices ni contención real: sus tests de concurrencia (stock 1 con 10 compradores, stock 5 con compras de 2, contador sin duplicados, doble clic, 5 confirmaciones/reembolsos en paralelo) prueban la lógica, **no** que Firestore evite la sobreventa.
- **Concurrencia real**: escrita en `orders/concurrency.emulator.test.ts` (sin ejecutar; el proyecto `unit` la excluye y se salta sola sin `FIRESTORE_EMULATOR_HOST`). Incluye una medición pendiente: 20 pedidos simultáneos sobre el contador `counters/orders` para ver si hay `CONTENTION`.
- **Flow real**: ninguna llamada a Flow (ni sandbox). El comportamiento de los puntos 1 a 6 de arriba queda por probar en el sandbox.
- **Despliegue**: no se comprobó que los secretos se monten, que `invoker: public` sea aceptado por la política de la organización, que el cuerpo `x-www-form-urlencoded` llegue parseado en `req.body` (es lo documentado para Functions) ni la IP real del cliente.
- **App Check**: se declara con `callableSecurityOptions()`, no se ejercitó.

## Secretos y variables a cargar (solo nombres)

- Secretos (Secret Manager, `defineSecret`; los carga Carlos): `FLOW_API_KEY`, `FLOW_SECRET_KEY`. Se montan solo en `createFlowPayment`, `flowConfirm`, `getOrderStatus` y `releaseExpiredReservations`.
- Parámetros no secretos, leídos de `process.env` (van en `functions/.env.<alias>` o `.env`): `APP_ENV`, `FLOW_API_BASE`, `FLOW_CONFIRMATION_URL`, `SITE_URL`. No usé `defineString` para no duplicar `SITE_URL`, que `triggers/` ya declara.
- `FLOW_CONFIRMATION_URL` = URL de la función `flowConfirm` desplegada (la entrega devops tras el primer despliegue); `SITE_URL` = URL de App Hosting.
- Sin esos valores: `createFlowPayment` responde `FLOW_UNAVAILABLE`, `flowConfirm` 500, y `getOrderStatus`/`releaseExpiredReservations` siguen funcionando sin reconciliar.

## Inconsistencias, huecos del contrato y cosas para decidir

1. **Límite de `getOrderStatus` vs. polling**: 30 consultas / 10 min por IP, pero la página de retorno consulta cada 3 a 5 s durante 90 s (18 a 30 consultas) y dos clientes detrás de la misma red se pisan. Es configurable en `settings/private.limits.orderStatusPerIpPer10Min`; **propongo subir el inicial a 120** (decide el tech-lead; hoy el valor por defecto es 30 como en el contrato).
2. **Campo adicional `order.flow.paidFlowOrder`** (no está en data-model.md 2.3): hace falta para detectar el segundo pago. Pido sumarlo al contrato (v1.4).
3. **`ORDER_NOT_PAYABLE` en el reintento idempotente de `createOrder`** cuando el pedido ya no está pendiente (no está en functions.md 3.1).
4. **Guarda de ambiente al primer uso**, no "al iniciar" (functions.md 3.3.1): ver arriba.
5. **Límite de fallos por número**: el token correcto no se bloquea (functions.md 3.4 no lo distingue).
6. **Huella de idempotencia más estricta** que la del contrato (ver arriba).
7. **`releaseExpiredReservations` espera 60 min si Flow falla** (functions.md 4.5 no define qué hacer si `getStatus` falla).
8. **IP en `rateLimits`**: la clave es `sha256("fn:ip")`; el espacio IPv4 es pequeño, así que un hash sin clave se puede revertir por fuerza bruta. Mitigación existente: TTL de 1 día (ya declarado en `firestore.indexes.json`). Si se quiere más, usar HMAC con un secreto dedicado.
9. **F3 (cómo se entera el admin de un `payment_review`)**: sigue abierta; el panel debe mostrar el contador y el filtro (los pedidos en revisión ya tienen `review.reason`).
10. `statusHistory` se recorta a 50 entradas conservando la primera y las más recientes (data-model.md 2.3 dice "máx. 50" sin definir qué hacer al pasar).
11. Estados desconocidos de Flow (distintos de 1 a 4) se registran como `ignored` y el endpoint responde 200.

## Qué necesito de otros agentes (vía tech-lead)

- **tech-lead**: conectar los dos `export *` en `functions/src/index.ts`; decidir los puntos 1 y 2 de arriba; v1.4 del contrato si se aprueban.
- **devops** (con confirmación de Carlos, nunca yo): cargar `FLOW_API_KEY` y `FLOW_SECRET_KEY` en Secret Manager (sandbox), definir `APP_ENV=staging`, `FLOW_API_BASE`, `SITE_URL` y `FLOW_CONFIRMATION_URL`, y desplegar. Confirmar que existen los índices de `orders` (`paymentStatus` + `reservedUntil`) y las políticas TTL de `idempotencyKeys` y `rateLimits` (ya están en `firestore.indexes.json`), y habilitar Cloud Scheduler.
- **nextjs-frontend**: los contratos de entrada y salida no cambiaron. Recordatorios: `/checkout/retorno` debe aceptar GET y POST y responder 303; el polling de `getOrderStatus` debe respetar el límite (ver punto 1); manejar `RATE_LIMITED`, `ORDER_NOT_FOUND`, `ORDER_NOT_PAYABLE` y `FLOW_UNAVAILABLE`.
- **qa-reviewer**: revisar con prioridad `payments/apply-status.ts` (idempotencia y validación de monto), `orders/create-order.ts` (precio, reserva, límites) y que los logs no tengan datos personales.
- **Cuando Carlos autorice emuladores/Java**: ejecutar `orders/concurrency.emulator.test.ts` (comando en el encabezado del archivo) y `test:rules`.
