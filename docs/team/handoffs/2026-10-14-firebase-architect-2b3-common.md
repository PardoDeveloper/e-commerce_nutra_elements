# Handoff firebase-architect — 2B.3 Módulo común de Cloud Functions

Fecha: 2026-10-14. Rama: develop. Sin commits (de eso se encarga devops). Sin emuladores, sin dependencias nuevas, sin tocar contratos (D-026).

## Qué hice
Lógica pura, sin I/O, en `functions/src/common/`, con un `*.test.ts` junto a cada módulo. Solo se importan de `firebase-functions` `HttpsError` y `logger`, y de `zod` los esquemas.

## Verificación (en `functions/`)
- `npm run build`: OK, sin errores.
- `npm run lint`: OK, sin avisos.
- `npm test`: **7 archivos, 193 tests, todos pasan** (options 1, errors, auth, rut, pricing, schemas, metrics).
- Extra: `npx tsc -p tsconfig.json --noEmit` (incluye los tests) sin errores.
- Nota: el script `test` de `package.json` ahora tiene `--project unit`; lo cambió otro agente, no yo.

## Módulos y API

### `errors.ts`
- `type AppErrorCode`: todos los `details.code` del contrato (INVALID_INPUT, UNAUTHENTICATED, NOT_ADMIN, APP_CHECK_FAILED, RATE_LIMITED, INTERNAL, INVALID_RUT, INVALID_COMMUNE, PICKUP_DISABLED, PRODUCT_UNAVAILABLE, OUT_OF_STOCK, ZERO_TOTAL, ORDER_TOO_LARGE, CONTENTION, ORDER_NOT_FOUND, ORDER_NOT_PAYABLE, ORDER_EXPIRED, FLOW_UNAVAILABLE, INVALID_TRANSITION, ORDER_NOT_TRANSFER, ORDER_NOT_PAID, REASON_REQUIRED, INVALID_REFUND_AMOUNT, INVALID_REFUND_DATE). Cada uno con su código `HttpsError` y mensaje en español fijos del contrato. Los códigos del catálogo/lotes (SKU_NOT_FOUND, etc.) se agregan cuando se implementen.
- `appError(code, extra?: { sku?; available?; fields? }): HttpsError` — `details = { code, sku?, available?, fields? }` (máx. 20 campos). El mensaje nunca interpola datos.
- `getAppErrorCode(err): AppErrorCode | undefined`.
- `toHttpsError(err): HttpsError` — deja pasar `HttpsError`; lo demás se registra solo con `errorName` y sale como `INTERNAL` genérico.
- `fieldsFromZodError(zodError)`, `invalidInputFromZod(zodError)` — `fields[].message` sale de mensajes fijos por tipo de issue; no repite valores ni nombres de claves desconocidas.

### `auth.ts`
- `assertAuthenticated(request): string` (uid; `UNAUTHENTICATED`).
- `assertAdmin(request): string` (uid; `UNAUTHENTICATED` sin sesión, `NOT_ADMIN` si `token.admin !== true`; `=== true` estricto, `"true"` o `1` no valen).
- `callableSecurityOptions(appEnv?): { enforceAppCheck: boolean }` e `isAppCheckEnforced(appEnv?)` — **falla cerrado**: solo `APP_ENV === "local"` desactiva App Check; si la variable falta o es otra cosa, se exige.
- `assertAppCheck(request, appEnv?)` — opcional, para lanzar `APP_CHECK_FAILED` con el formato del contrato en vez del error genérico del SDK.
- Acepta `AuthRequestLike` (forma mínima), compatible con `CallableRequest`.

### `rut.ts`
- `normalizeRut(input: unknown): string | null` (`12345678-K`), `isValidRut`, `computeRutDv(body)`.

### `pricing.ts`
- `computeFinalPrice(price, discount?): number` (data-model.md 7.3).
- `computePricing({ items, products: ReadonlyMap<sku, PricingProduct>, settings: PricingSettings, delivery }): PricingResult` con `lines[]` (`sku, name, unitPrice, discount, unitFinalPrice, qty, lineTotal`, igual al snapshot `OrderItem`), `listSubtotal`, `discountTotal`, `subtotal`, `shipping`, `total`, `freeShippingApplied`, `delivery` (con `communeName` resuelto del settings).
- `PricingProduct` y `PricingSettings` son subconjuntos de `products/{sku}` y `settings/public`: se les puede pasar `doc.data()` directamente.

### `schemas.ts`
- `createOrderRequestSchema` (zod, `strictObject`), `type CreateOrderRequest`, `parseCreateOrderRequest(data): CreateOrderRequest` (lanza `INVALID_RUT` si el único problema es el RUT; si no, `INVALID_INPUT` con `fields`), `normalizePhone`.

### `metrics.ts`
- `businessDate(date: Date): string` (`YYYY-MM-DD`, America/Santiago), `dailyMetricsPath(date)`, `productMetricsPath(sku)`.
- `paymentIncrements({ paidAt, total, subtotal, items }): MetricsIncrements`.
- `refundIncrements({ paidAt, total, items, refund: { amount, restocked } }): MetricsIncrements` (D-025; usa `restocked`, no `restock`).
- `averageTicket(revenue, ordersCount): number | null`.
- `MetricsIncrements = { date, daily: {ordersCount, revenue, merchandise, unitsSold, refundsCount, refundedAmount}, products: [{sku, name, unitsSold, revenue}] }`. Los campos sin cambio vienen en 0 (se pueden omitir al escribir). En `refundIncrements`, `products` va vacío si `restocked == false`.

## Decisiones sobre ambigüedades (el contrato no se cambió)
1. **Estricto en la dirección segura.** `computePricing` verifica también `published && active` y stock (pasos 3 y 4 de 3.1) en una sola pasada, en el orden: ítems, producto/stock (en el orden del carrito), entrega, total. El primer error gana. SKU inexistente, no publicado o inactivo dan el mismo `PRODUCT_UNAVAILABLE` (no se filtra la causa).
2. **SKU duplicados:** el contrato dice "SKUs distintos" sin indicar qué error. Se rechazan con `INVALID_INPUT` (path `items.N.sku`) en vez de sumar cantidades, para no saltarse el tope por producto. Se controla en el esquema y de nuevo en `computePricing`.
3. **Tope de cantidad:** el esquema acepta qty entera 1..100 (máximo permitido de `settings.maxQtyPerItem`); el tope real (10 por defecto) lo aplica `computePricing` con los settings. Una qty fuera de rango da `INVALID_INPUT` con path `items.N.qty`.
4. **Umbral de envío gratis fuera de contrato** (0, negativo, decimal, NaN): se ignora, o sea no hay envío gratis. Un 0 regalaría el envío a todos. Retiro en tienda nunca marca `freeShippingApplied`.
5. **Descuento corrupto** (precio fuera de 1..10.000.000 o valor no entero o negativo) lanza `INTERNAL`: es un problema de datos nuestro. Un `fixed` mayor que el precio no es corrupto: se acota a 0 (contrato). `percent` mayor que 100 se trata como 100 (precio 0).
6. **Línea en 0:** un total de 0 solo pasa a `ZERO_TOTAL` si no hay envío; con despacho el total es el envío (> 0) y se acepta.
7. **RUT:** cuerpo de 7 u 8 dígitos **sin cero a la izquierda**, para que cada RUT tenga una sola forma normalizada. Puntos solo en formato de miles correcto (`12.345.678-5`). `INVALID_RUT` en el esquema solo si el RUT es el único error; si fallan más campos sale `INVALID_INPUT` con `fields` (el path `customer.rut` va sin el valor).
8. **Normalización de otros campos:** correo en minúsculas (útil como clave del límite por correo); `clientRequestId` en minúsculas; teléfono: se quitan espacios, guiones, puntos y paréntesis, se conserva un `+` inicial y se exigen 8 a 15 dígitos. **No** se agrega prefijo de país a un teléfono sin `+` (no invento el código +56).
9. **Reembolso:** `refundIncrements` valida `amount` entero 1..total (`INVALID_REFUND_AMOUNT`). El caso (b4) del contrato (restock pedido pero `stockState != committed`) se resuelve en la función que llama: pasa `restocked: false` y las unidades no se tocan.
10. **Fecha de negocio:** usa `Intl.DateTimeFormat` con `America/Santiago` (Node 24 trae ICU completo). Las pruebas cubren medianoche y los cambios de horario de 2026 (fin del verano el 5-abr 03:00Z, inicio el 6-sep 04:00Z); esas fechas salen de mi lectura de la regla de tzdata de Chile y los tests pasan contra el tzdata de este Node, pero conviene revalidarlas si cambia la política horaria de Chile.

## Lo que usará la 2B.4 (`createOrder`)
- Entrada: `parseCreateOrderRequest(request.data)` → objeto normalizado (RUT `12345678-K`, correo en minúsculas).
- Dentro de la transacción, tras las lecturas: `computePricing({ items, products, settings: settingsPublic, delivery })`, con `delivery` = `{type:'shipping', communeCode}` o `{type:'pickup'}`. Del resultado salen el snapshot de `items`, `subtotal`, `shipping`, `total`, `freeShippingApplied` y `delivery` (con `communeName`). El `storeAddress` y `storeHours` del retiro los toma del settings quien llama.
- Seguridad y opciones: `onCall({ ...callableSecurityOptions(), timeoutSeconds: 30 }, ...)`; errores siempre con `appError(...)` y `toHttpsError` en el `catch` externo.
- Métricas (2B.4/2B.5 al pagar, y `recordManualRefund`): `paymentIncrements` y `refundIncrements` dan los deltas; la Function los traduce a `FieldValue.increment` (omitiendo ceros si quiere).
- Pendiente de 2B.4, no de este módulo: límites por IP y correo, idempotencia, contador, hash del token.

## Sin verificar
- Que `enforceAppCheck: false` en el emulador (con `APP_ENV=local`) deje pasar las llamadas sin token: depende del emulador y no se ejecutó (D-026). Si el emulador exige el token de depuración, no cambia este código.
- Los vectores del RUT se calcularon con la fórmula de módulo 11 y se comprobaron a mano (por ejemplo 12345678-5 y 18972631-7, los de uso común); no se contrastaron con una fuente externa.

## Qué necesito de otros
- Nada bloqueante. Los archivos de configuración no se tocaron (`package.json`, lockfile, `vitest.config.mts`, `eslint.config.mjs`, `tsconfig*`).
- tech-lead: confirmar si aceptan las decisiones 2, 4 y 7 (duplicados rechazados, umbral inválido ignorado, RUT sin ceros a la izquierda); si no, es un cambio de una línea.
