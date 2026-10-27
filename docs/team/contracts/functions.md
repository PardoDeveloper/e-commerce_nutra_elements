# Contrato de Cloud Functions — Nutra Elements

Tarea 2A.2. Autor: firebase-architect. Estado: **v1.4 — D-032 y correcciones del QA de pedidos y pagos (2026-10-20)** (v1.3: D-032 de catálogo; v1.2: D-027 y D-029; v1.1: D-025; v1 aprobada por tech-lead el 2026-10-14, D-024). Contrato con nextjs-frontend: no se cambia sin aprobación.

**Cambios y desviaciones aceptadas v1.4 (D-032, aprobadas por el tech-lead):**
- `order.flow.paidFlowOrder` (ver data-model.md 2.3) y detección del segundo pago de Flow en cualquier estado salvo `pending_payment`, `expired` y `cancelled` (3.3).
- `ORDER_NOT_PAYABLE` en el reintento idempotente de `createOrder` cuando el pedido ya no está `pending_payment`.
- Huella de idempotencia más estricta: carrito (ordenado), medio de pago, RUT, correo y entrega; el mismo `clientRequestId` con otro contenido es `INVALID_INPUT`.
- Guarda anti-cobro real: en `APP_ENV` `local` y `staging` solo se acepta el sandbox de Flow; en `production`, solo la API real.
- Token de acceso derivado del `clientRequestId` (3.1): un reintento idempotente devuelve el mismo token (M3).
- `flowConfirm`: límite por IP y respuesta 429 (3.3); usa solo la configuración de la API de Flow (M4).
- `releaseExpiredReservations` corta el ciclo tras 3 errores seguidos de Flow (4.5, M2).
- `recordManualRefund`: `method: "flow"` solo si el pedido se pagó con Flow (4.6, B1).
- Límite de `getOrderStatus`: 120 consultas por IP cada 10 minutos (3.4).
Depende de [data-model.md](data-model.md) (rutas, campos, estados, fórmulas). Decisiones: D-004 a D-012, D-016, D-018, D-020 a D-025, D-027, D-029.

Lo que **no** he podido verificar (debe leerse en la documentación oficial antes de implementar; está marcado "VERIFICAR"): la API de Flow (nombres de parámetros, firma, estados, forma del retorno, reintentos), las opciones exactas de `firebase-functions` v2 (`onCall`, `onRequest`, `onSchedule`, `onDocumentWritten`) en la versión instalada, y el comportamiento de secretos y `.env` en el emulador.

---

## 1. Reglas comunes

- Cloud Functions de **2ª generación**, **TypeScript estricto**, Node en la versión LTS que soporte `firebase-functions` instalado. Todas con `region: "us-east4"`. Los triggers de Firestore deben estar en la misma región que la base (`us-east4`). Región fijada una vez con `setGlobalOptions({ region: "us-east4", maxInstances: 10 })`; cada función ajusta lo suyo.
- El Admin SDK se usa **solo** aquí. Nada de secretos en el código (repo público, D-020).
- Autorización:
  - `public`: sin sesión. Callables con `enforceAppCheck: true` en producción (en el emulador, App Check desactivado o con token de depuración).
  - `admin`: `request.auth` presente **y** `request.auth.token.admin === true`. Sin sesión → `unauthenticated`; con sesión sin claim → `permission-denied`. También con `enforceAppCheck: true`.
  - `system`: lo invoca Cloud Scheduler o Firestore, nunca un cliente.
  - `flow`: endpoint HTTP que Flow llama; sin sesión, protegido con la firma de `getStatus` (no se confía en el cuerpo).
- Entrada: cada callable valida con un esquema (zod u otro; se elige al implementar) **antes** de tocar datos. Cadenas con `trim`, sin caracteres de control, con largo máximo. Los números deben ser enteros seguros. Campos desconocidos se rechazan (`strict`).
- Errores: se lanzan `HttpsError(code, message, details)`. `code` es uno de los códigos estándar (`invalid-argument`, `unauthenticated`, `permission-denied`, `not-found`, `failed-precondition`, `resource-exhausted`, `aborted`, `internal`). `details.code` es el **código de aplicación** (mayúsculas) que usa el frontend para decidir qué mostrar. `message` está en español, es apto para mostrar al usuario y **nunca** contiene datos internos, SQL, rutas ni secretos.
- Toda la lógica de dinero y stock se hace en **transacciones de Firestore** (lecturas antes que escrituras). El tiempo es el del servidor.
- Idempotencia: cada función indica abajo cómo se logra. En general: el estado actual del documento decide; repetir una llamada no repite efectos.
- Costos: `maxInstances` bajos, `timeoutSeconds` cortos, `minInstances: 0`. Ningún trigger escribe el documento que escucha (sin bucles).
- Fechas en requests y responses: string ISO 8601 UTC. Dinero: `number` entero CLP.
- Registro: `logger` de Functions con `orderNumber`, `sku` y códigos. **Nunca** se registran emails, teléfonos, direcciones, **RUT**, tokens de acceso, `token` de Flow completos ni secretos.

Tipos comunes
```ts
type Clp = number;
type Sku = string;
type PaymentMethod = 'flow' | 'transfer';
type PaymentStatus = 'pending_payment' | 'paid' | 'payment_review' | 'expired' | 'cancelled' | 'refunded';   // 'refunded' es terminal; etiqueta "Reembolsado"
type RefundMethod = 'flow' | 'transfer';
type FulfillmentStatus = 'preparing' | 'ready_for_pickup' | 'on_route' | 'delivered';

interface AppErrorDetails {
  code: string;                       // código de aplicación, ver tabla de cada función
  sku?: Sku;
  available?: number;
  fields?: { path: string; message: string }[];   // para INVALID_INPUT
}
```
Errores comunes a todas las callables
| `HttpsError` | `details.code` | Cuándo |
|---|---|---|
| `invalid-argument` | `INVALID_INPUT` | falla el esquema (con `fields`) |
| `unauthenticated` | `UNAUTHENTICATED` | admin sin sesión |
| `permission-denied` | `NOT_ADMIN` | sesión sin claim `admin` |
| `failed-precondition` | `APP_CHECK_FAILED` | token de App Check ausente o inválido |
| `resource-exhausted` | `RATE_LIMITED` | demasiados intentos |
| `internal` | `INTERNAL` | error no previsto (mensaje genérico) |

---

## 2. Catálogo de funciones

| # | Nombre | Tipo | Autorización | Memoria / timeout / maxInstances (propuesto) |
|---|---|---|---|---|
| 1 | `createOrder` | callable | public + App Check | 256 MiB / 30 s / 10 |
| 2 | `createFlowPayment` | callable | public (número + token) + App Check | 256 MiB / 30 s / 10 |
| 3 | `flowConfirm` | HTTP (`onRequest`) | flow (firma vía `getStatus`) | 256 MiB / 30 s / 10 |
| 4 | `getOrderStatus` | callable | public (número + token) + App Check | 256 MiB / 20 s / 10 |
| 5 | `confirmTransferPayment` | callable | admin | 256 MiB / 30 s / 5 |
| 6 | `resolvePaymentReview` | callable | admin | 256 MiB / 30 s / 5 |
| 7 | `cancelOrder` | callable | admin | 256 MiB / 30 s / 5 |
| 8 | `updateFulfillment` | callable | admin | 256 MiB / 15 s / 5 |
| 9 | `recordManualRefund` | callable | admin | 256 MiB / 30 s / 5 |
| 10 | `releaseExpiredReservations` | scheduled, cada 5 min | system | 256 MiB / 120 s / 1 |
| 11 | `importCatalog` | callable | admin | 512 MiB / 120 s / 2 |
| 12 | `importPrices` | callable | admin | 256 MiB / 60 s / 2 |
| 13 | `importStock` | callable | admin | 256 MiB / 60 s / 2 |
| 14 | `applyDiscount` | callable | admin | 256 MiB / 60 s / 2 |
| 15 | `setProductsPublished` | callable | admin | 256 MiB / 60 s / 2 |
| 16 | `createProduct` | callable | admin | 256 MiB / 30 s / 2 |
| 17 | `updateProductCommerce` | callable | admin | 256 MiB / 30 s / 2 |
| 18 | `grantAdmin` / `revokeAdmin` | callable | admin | 256 MiB / 15 s / 2 |
| 19 | `onProductWritten` | trigger Firestore `products/{sku}` | system | 256 MiB / 30 s / 5 |
| 20 | `onCategoryWritten` | trigger `categories/{id}` | system | 256 MiB / 30 s / 3 |
| 21 | `onSettingsPublicWritten` | trigger `settings/public` | system | 256 MiB / 30 s / 2 |
| 22 | `deleteProducts` | callable | admin + App Check | 256 MiB / 60 s / 2 |
| 23 | `restoreProducts` | callable | admin + App Check | 256 MiB / 60 s / 2 |
| 24 | `getFlowCredentialsStatus` | callable | admin + App Check | 256 MiB / 30 s / 2 |
| 25 | `setFlowCredentials` | callable | admin + App Check | 256 MiB / 30 s / 2 |
| 26 | `submitContactMessage` | callable | public + App Check | 256 MiB / 15 s / 5 |

Los nombres son los que el frontend usa con `httpsCallable(functions, "createOrder")`. El cliente se configura con la región `us-east4`. `flowConfirm` no lo llama el frontend.

---

## 3. Funciones públicas (checkout)

### 3.1 `createOrder`

- Tipo: callable. Región `us-east4`. Autorización: público + App Check.
- Qué hace: valida, calcula precios, descuentos, envío y total **en el servidor**, y en **una sola transacción** reserva el stock, toma el número del contador y crea el pedido. Nada del precio viene del cliente (D-005).

```ts
interface CreateOrderRequest {
  clientRequestId: string;            // UUID v4 generado por el navegador al abrir el checkout; clave de idempotencia
  items: { sku: Sku; qty: number }[]; // 1..20 líneas, SKUs distintos, qty 1..settings.maxQtyPerItem (por defecto 10)
  paymentMethod: PaymentMethod;
  customer: {
    firstName: string;                // 1..60
    lastName: string;                 // 1..60
    email: string;                    // formato válido, <= 254 (Flow lo exige)
    phone: string;                    // 8..15 dígitos, admite +, se normaliza
    rut: string;                      // OBLIGATORIO (D-024). Admite puntos, guion y k minúscula; el servidor valida el dígito verificador (módulo 11) y lo guarda normalizado `12345678-K`
  };
  delivery:
    | { type: 'shipping'; communeCode: string; address: string; notes?: string } // address 5..200, notes <= 300
    | { type: 'pickup' };
}

interface CreateOrderResponse {
  orderNumber: string;                // "NE-000123"
  accessToken: string;                // token de acceso en claro; SE ENTREGA UNA SOLA VEZ
  paymentMethod: PaymentMethod;
  paymentStatus: 'pending_payment';
  subtotal: Clp;
  shipping: Clp;
  total: Clp;
  freeShippingApplied: boolean;
  items: { sku: Sku; name: string; unitFinalPrice: Clp; qty: number; lineTotal: Clp }[];
  reservedUntil: string;              // ISO
  next: 'pay_with_flow' | 'show_transfer_instructions';
}
```
- Los precios del `response` son informativos para pintar la confirmación; lo que vale es el pedido en el servidor. El cliente **no** envía nunca precios, descuentos, envío ni total.
- Token de acceso (v1.4): `base64url(sha256("nutra-elements:order-access-token:v1:" + clientRequestId))` (43 caracteres; 122 bits de entropía del UUID v4 que solo conoce el navegador). Antes eran 32 bytes aleatorios; se deriva para que un reintento idempotente devuelva el mismo token sin guardarlo en claro. En el pedido solo se guarda `accessTokenHash = sha256(token)`. Quien conozca solo el número `NE-xxxxxx` no puede ver nada.
- Pasos
  1. `enforceAppCheck`. Validar esquema. Límite por IP: `rateLimits` clave `createOrder:<sha256(ip)>`, máx. **5 pedidos por 10 minutos** y, por correo, máx. **3 pedidos `pending_payment` abiertos** (se consulta fuera de la transacción) → `RATE_LIMITED`. Son los valores iniciales aceptados en D-024 y son **configurables** en `settings/private.limits` (`createOrderPerIpPer10Min`, `pendingOrdersPerEmail`); evitan bloquear stock con pedidos basura. Validar el RUT (módulo 11) y normalizarlo también en este paso, antes de tocar datos → `INVALID_RUT`.
  2. Transacción: leer `idempotencyKeys/{sha256(clientRequestId)}`; si existe, devolver el **mismo** pedido (ver "Idempotencia"). Leer `settings/public`, `settings/private`, `counters/orders` y los `products/{sku}` del carrito (todas las lecturas primero).
  3. Verificar por producto: existe, `published && active` y `deletedAt == null` (si falla algo, `PRODUCT_UNAVAILABLE`; un SKU **eliminado** se trata igual que uno no publicado y no se distingue hacia el cliente, D-029), `stock >= qty` (`OUT_OF_STOCK`, con `sku` y `available`). Si es despacho: `communeCode` ∈ `settings.communes` (`INVALID_COMMUNE`); si es retiro: `pickup.enabled` (`PICKUP_DISABLED`).
  4. Calcular con las fórmulas de data-model.md 7.3 y 7.4: `unitFinalPrice = computeFinalPrice(price, discount)` (se recalcula, no se confía en el `finalPrice` guardado), `subtotal`, `shipping`, `total`. `total > 0` y `<= 50.000.000` (`ZERO_TOTAL`, `ORDER_TOO_LARGE`).
  5. Escribir: `counters/orders.last += 1` (o iniciar en `orderNumberStart - 1`), el pedido `orders/NE-xxxxxx` con snapshot, `reservedUntil = now + settings.reservationMinutes[paymentMethod]`, `stockState = "reserved"`, y por cada producto `stock -= qty`, `reserved += qty`, `inStock = (stock - qty) > 0`; escribir `idempotencyKeys/...`. El pedido nace con `refund: null` y `statusHistory` con su primera entrada. `customer.rut` se guarda normalizado y no vuelve a salir del servidor salvo para el admin.
- Errores (`HttpsError` / `details.code`)
  | `HttpsError` | `details.code` | Mensaje |
  |---|---|---|
  | `invalid-argument` | `INVALID_INPUT` | "Revisa los datos del formulario." |
  | `invalid-argument` | `INVALID_RUT` | "Revisa tu RUT." (falta, formato o dígito verificador incorrectos; el mensaje nunca repite el RUT) |
  | `invalid-argument` | `INVALID_COMMUNE` | "Solo despachamos a comunas de la Región Metropolitana." |
  | `failed-precondition` | `PICKUP_DISABLED` | "El retiro en tienda no está disponible." |
  | `failed-precondition` | `PRODUCT_UNAVAILABLE` | "Un producto ya no está disponible." (con `sku`) |
  | `failed-precondition` | `OUT_OF_STOCK` | "No hay stock suficiente de un producto." (con `sku`, `available`) |
  | `failed-precondition` | `ZERO_TOTAL` / `ORDER_TOO_LARGE` | "No se puede procesar este pedido." |
  | `resource-exhausted` | `RATE_LIMITED` | "Demasiados intentos o pedidos sin pagar con este correo. Intenta de nuevo en unos minutos." |
  | `aborted` | `CONTENTION` | "El sistema está ocupado, intenta de nuevo." (la transacción agotó los reintentos) |
- Idempotencia: el cliente genera `clientRequestId` una vez por intento de compra y lo reutiliza si hay un fallo de red o un reintento. Si `idempotencyKeys/...` ya existe, se devuelve el pedido ya creado (sin descontar de nuevo ni consumir otro número). **Desde la v1.4 el token se deriva del `clientRequestId`, así que el reintento devuelve el MISMO token y no escribe nada en el pedido** (el que el cliente ya recibió sigue válido). Si el pedido ya no está `pending_payment`, `ORDER_NOT_PAYABLE`. Para cualquier otra llamada con ese `clientRequestId` pero con carrito distinto (o con otro RUT) → `INVALID_INPUT`.
- Efectos y revalidación: cambia `stock` de los productos → el trigger `onProductWritten` revalida las fichas solo si cambió `inStock` (ver 8).
- Concurrencia: dos compradores del último producto → uno obtiene el pedido y el otro `OUT_OF_STOCK`, nunca ambos (sección 9, test 1).

### 3.2 `createFlowPayment` (inicio de pago con Flow)

- Callable, público (número + token) + App Check.

```ts
interface CreateFlowPaymentRequest {
  orderNumber: string;       // "NE-000123"
  accessToken: string;
}
interface CreateFlowPaymentResponse {
  redirectUrl: string;       // URL de Flow a la que el navegador debe ir (url + "?token=" + token)
  reservedUntil: string;     // ISO
}
```
- Pasos: buscar el pedido; comparar `sha256(accessToken)` con `accessTokenHash` en tiempo constante (si no coincide o no existe → mismo error `ORDER_NOT_FOUND`, sin distinguir). Exigir `paymentMethod == "flow"`, `paymentStatus == "pending_payment"` y `reservedUntil > now`. El **monto sale de `order.total`**, no del cliente. Firmar y llamar `payment/create` de Flow con: `commerceOrder` (= `orderNumber`), `subject` ("Pedido NE-000123 - Nutra Elements"), `currency` "CLP", `amount` (= `total`), `email` (= `customer.email`), `urlConfirmation`, `urlReturn` (sección 3.3.1). Guardar en `order.flow` `{commerceOrder, token, flowOrder, paymentUrl, attempt, createdAt}`.
- Idempotencia: si el pedido ya tiene `flow.token` y `flow.lastStatus` es pendiente (o desconocido y el último `getStatus` dice pendiente), se devuelve la **misma** `paymentUrl` sin crear otra orden en Flow. Si Flow ya informó rechazo o anulación, se crea un nuevo intento (`attempt + 1`). VERIFICAR en la documentación de Flow si repetir `commerceOrder` está permitido; si no, el intento nuevo usa `NE-000123-2` y `flowConfirm` interpreta el sufijo (el pedido se resuelve quitando el sufijo `-\d+`).
- Errores
  | `HttpsError` | `details.code` | Cuándo |
  |---|---|---|
  | `not-found` | `ORDER_NOT_FOUND` | número o token incorrectos |
  | `failed-precondition` | `ORDER_NOT_PAYABLE` | método no es Flow, o el estado no es `pending_payment` (incluye pagado) |
  | `failed-precondition` | `ORDER_EXPIRED` | `reservedUntil` vencido: el cliente debe crear un pedido nuevo |
  | `unavailable` | `FLOW_UNAVAILABLE` | Flow no responde o devuelve error (el pedido sigue pendiente; el cliente puede reintentar) |
- Efectos: escribe solo `order.flow` y `updatedAt`. No toca stock.

### 3.3 `flowConfirm` (confirmación de Flow)

- Tipo: **HTTP** (`onRequest`), `POST`, `Content-Type: application/x-www-form-urlencoded` con el campo `token` (VERIFICAR). Autorización: sin sesión; invocable públicamente (Cloud Run `invoker: public`) y protegido porque **no se confía en nada del cuerpo salvo el `token`**, que se valida contra Flow con `getStatus` firmado. Sin App Check (lo llama Flow).
- Respuestas HTTP
  | Situación | Respuesta |
  |---|---|
  | Método distinto de POST | 405 |
  | Más de `limits.flowConfirmPerIpPer10Min` (300) llamadas por IP en 10 minutos (v1.4) | 429, sin llamar a Flow |
  | `token` ausente, vacío, >100 caracteres o con caracteres no esperados | 400 (se rechaza antes de leer Firestore o llamar a Flow, y no consume el límite) |
  | Flow no reconoce el token (`getStatus` devuelve error de cliente) | 400 (no se reintenta) |
  | Falla interna o de red hacia Flow/Firestore | 500 (Flow reintenta; VERIFICAR política de reintentos) |
  | Procesado (pagado, en revisión, pendiente, rechazado, duplicado) | **200** cuerpo vacío |
- Pasos
  1. Llamar `GET payment/getStatus` con `apiKey`, `token` y la firma `s` calculada con `FLOW_SECRET_KEY` (HMAC-SHA256 de los parámetros ordenados por nombre y concatenados nombre+valor; VERIFICAR el esquema exacto). Se obtienen `flowOrder`, `commerceOrder`, `status`, `amount`, `currency`.
  2. Resolver el pedido por `commerceOrder` (quitando sufijo de reintento si aplica). Si no existe → registrar y responder 400.
  3. Transacción sobre `orders/{n}`, `paymentEvents/{token}` y los `products` del pedido (lecturas primero):
     - `status` pagado (2): validar **monto == `order.total`**, moneda == `CLP` y que `commerceOrder` coincida. Si falla, el pedido pasa a `payment_review` (`AMOUNT_MISMATCH` o `CURRENCY_MISMATCH`), la reserva se mantiene y no se marca pagado.
       - `pending_payment` con `stockState == reserved` → `paid` (confirmar venta: `reserved -= qty`, `stockState = committed`, `fulfillmentStatus = preparing`, `paidAt`, `statusHistory`, **métricas** con `increment`).
       - `expired` (`stockState == released`) → intentar **re-reservar** todo en la misma transacción; si alcanza → `paid`; si no → `payment_review` (`NO_STOCK_AFTER_EXPIRY`) y sin tocar stock.
       - `cancelled` → `payment_review` (`PAID_AFTER_CANCEL`).
       - `paid`, `payment_review` o `refunded` con el mismo `flowOrder` → no hay cambios (duplicado; un pedido reembolsado no vuelve a `paid`).
       - (v1.4) `paid`, `payment_review` o `refunded` con un `flowOrder` distinto de `flow.paidFlowOrder` → segundo cobro: resultado `duplicate`; se anota `DUPLICATE_PAYMENT` una sola vez por token en `statusHistory` y en `paymentEvents.warnings`; el pedido no cambia de estado.
     - `status` pendiente (1) → solo registrar `flow.lastStatus`; el pedido sigue `pending_payment`.
     - `status` rechazado o anulado (3, 4) → registrar; el pedido sigue `pending_payment` y el cliente puede reintentar mientras dure la reserva.
     - Escribir `paymentEvents/{token}` con `outcome` y `receivedCount += 1`.
  4. Responder 200.
- **Configuración (v1.4)**: `flowConfirm` solo necesita el cliente de la API (`APP_ENV`, `FLOW_API_BASE`, `FLOW_API_KEY`, `FLOW_SECRET_KEY`); no exige `FLOW_CONFIRMATION_URL` ni `SITE_URL`. Un fallo de configuración responde 500 y no se recuerda: al corregirlo, la misma instancia se recupera.
- **Idempotencia**: Flow puede llamar varias veces (reintentos, o la reconciliación de `getOrderStatus`). Es seguro porque (a) el `getStatus` es la fuente de verdad, no el cuerpo; (b) la transición `pending_payment → paid` solo ocurre dentro de la transacción si el estado leído es `pending_payment`/`expired`; una segunda ejecución lee `paid` y no cambia nada, ni stock ni métricas; (c) `paymentEvents/{token}` registra el resultado y cuenta las llegadas. Un mismo pedido con dos tokens distintos pagados (dos intentos) deja el segundo como `duplicate` y queda **anotado para revisión manual** (reembolso a mano): se agrega `warnings` en `paymentEvents` y una entrada en `statusHistory`. PREGUNTA ABIERTA F3 (cómo avisar al admin sin correos: se muestra en el panel de pedidos "en revisión").
- Efectos: escribe `orders/{n}`, `paymentEvents/{token}`, `products/*` (solo `reserved`/`stock`/`inStock`), `metrics/*` (solo al pasar a `paid`).
- Revalidación: el cambio de `inStock` en productos lo cubre `onProductWritten`.

#### 3.3.1 URLs de confirmación y de retorno por ambiente

Las dos URLs las **arma el servidor** al llamar a `payment/create`; el cliente nunca las envía.

| Ambiente | `urlConfirmation` (Flow llama al servidor) | `urlReturn` (Flow redirige al navegador) | Flow |
|---|---|---|---|
| **local** (emuladores) | `FLOW_CONFIRMATION_URL` = `https://<host-del-túnel>/nutraelementsdev/us-east4/flowConfirm`. Flow necesita una URL pública: el túnel (herramienta por elegir en la tarea de Flow, con aprobación de Carlos, D-021) apunta al puerto del emulador de Functions | `SITE_URL` + `/checkout/retorno?o=<orderNumber>` con `SITE_URL=http://localhost:3000` (sin token, A2) | sandbox |
| **staging** (proyecto `nutraelements`, antes del lanzamiento; noindex) | `FLOW_CONFIRMATION_URL` = URL de `flowConfirm` desplegada, que entrega devops tras el primer despliegue | `SITE_URL` = URL de App Hosting (aún sin dominio) | sandbox |
| **production** (D-036: activo en `nutraelements` antes del dominio) | `https://us-east4-nutraelements.cloudfunctions.net/flowConfirm` (la URL de la función no cambia) | `SITE_URL` = URL de App Hosting; con el dominio, `https://nutraelements.cl` | producción de Flow |

- El host del túnel cambia en cada sesión: se pasa por variable (`FLOW_CONFIRMATION_URL`) en el `.env` local, sin versionar.
- **A2 (v1.5, D-036)**: el token de acceso **no** viaja en `urlReturn`; solo el número de pedido. El navegador guarda `{número, token}` en `localStorage` (`ne.orderAccess.v1`) al recibir la respuesta de `createOrder` y la página del pedido lo lee de ahí. Si el comprador vuelve en otro navegador, la página le pide abrir el enlace completo que se mostró al comprar. `/checkout`, `/checkout/retorno` y `/pedido/*` responden `Referrer-Policy: no-referrer` y `noindex`.
- Ruta de retorno: **`/checkout/retorno`** debe ser un *route handler* de Next.js que acepte **GET y POST** (Flow redirige al navegador con `POST` y el `token` de Flow en el cuerpo; VERIFICAR), ignore el cuerpo y responda `303` hacia `/pedido/<orderNumber>` (número validado con `^NE-d{6,9}$`; si no es válido, a `/`). La página de confirmación hace polling de `getOrderStatus` (3.4) cada 3–5 s hasta 90 s, porque la confirmación de Flow puede llegar después que el navegador.
- Guardas: `assertEnv()` al iniciar. `APP_ENV` ∈ `local | staging | production`. En `local` y `staging`, `FLOW_API_BASE` debe ser el sandbox; en `production`, el de producción; si no coinciden, la función falla al arrancar. Así no se cobra de verdad por un error de configuración. Hosts: sandbox `https://sandbox.flow.cl/api`, producción `https://www.flow.cl/api` (VERIFICAR).

### 3.4 `getOrderStatus` (consulta pública del estado)

- Callable, público + App Check. Se usa en la página de retorno/confirmación.
- Pensada para que **quien adivine un número no obtenga datos**: exige número **y** token.

```ts
interface GetOrderStatusRequest {
  orderNumber: string;
  accessToken: string;
}
interface GetOrderStatusResponse {
  orderNumber: string;
  createdAt: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus | null;
  reservedUntil: string | null;        // solo mientras paymentStatus == 'pending_payment'
  delivery: { type: 'shipping'; communeName: string } | { type: 'pickup'; storeAddress: string; storeHours: string };
  items: { name: string; qty: number; lineTotal: Clp }[];
  subtotal: Clp;
  shipping: Clp;
  total: Clp;
  transferInstructions?: {             // solo si paymentMethod == 'transfer' y paymentStatus == 'pending_payment'
    bankName: string; accountType: string; accountNumber: string; holderName: string; holderRut: string; contactEmail?: string;
    amount: Clp; reference: string;    // reference = orderNumber
  };
  trackingNote: string;                // texto fijo: "Guarda tu número de pedido; con él puedes seguir tu despacho en DispatchTrack."
}
```
- **No se devuelve**: email, teléfono, dirección, notas, **RUT** (dato personal, D-024), `accessTokenHash`, datos de Flow, `refund` ni `statusHistory`. Un pedido reembolsado se ve solo como `paymentStatus: 'refunded'`. Del domicilio solo `communeName`.
- Errores: `not-found` / `ORDER_NOT_FOUND` tanto si el número no existe como si el token es incorrecto (misma respuesta y mismo tiempo aproximado; comparación en tiempo constante, y se hace el hash aunque el pedido no exista). `RATE_LIMITED`: máx. **120 consultas por 10 min por IP** (v1.4; antes 30: el polling del retorno de Flow hace 18 a 30 en 90 s) (clave `getOrderStatus:<sha256(ip)>`) y **10 fallos por número**; ambos son valores iniciales aceptados (D-024), configurables en `settings/private.limits` (`orderStatusPerIpPer10Min`, `orderStatusFailuresPerOrder`).
- **Reconciliación**: si `paymentMethod == "flow"`, `paymentStatus == "pending_payment"`, hay `flow.token` y `flow.lastCheckedAt` tiene más de 15 s, la función consulta `getStatus` y aplica **la misma rutina transaccional de `flowConfirm`** (es idempotente). Sirve si la confirmación de Flow se retrasa o si el túnel local no está activo. El resultado ya actualizado se devuelve en la misma respuesta.
- Costo: 1 lectura del pedido (más ≤1 llamada a Flow cada 15 s) por consulta.
- Pérdida del número o del token: sin correos (D-008) no hay recuperación; el número lo ve el cliente en pantalla. PREGUNTA ABIERTA F4.

### 3.5 `submitContactMessage` (formulario de `/contacto`)

- Entrada (`strictObject`): `{name, email, phone?, message, website?}`. `name` 2..100 (una línea), `email` válido ≤254 (se guarda en minúsculas), `phone` opcional (se quitan espacios, guiones y paréntesis; debe quedar `+?\d{8,15}`), `message` 10..2000. `website` es una **trampa para bots**: el formulario lo deja vacío y oculto; si viene con texto se responde `{ok: true}` sin guardar nada.
- Efecto: crea `contactMessages/{id}` (data-model 2.10) con `read: false`, `archived: false`, `createdAt = updatedAt = ahora`.
- Respuesta: `{ok: true}`. No devuelve el ID ni datos.
- Errores: `INVALID_INPUT`; `RATE_LIMITED` con máx. **5 mensajes por 10 min por IP** (clave `submitContactMessage:<ip>` con hash en `rateLimits`). Sin IP no se limita (igual que 3.4).
- El admin gestiona los mensajes con escrituras directas (reglas), no con Functions. No se envían correos (D-008).

---

## 4. Funciones de gestión de pedidos (admin)

Todas: callable, `admin`, `enforceAppCheck`. Quien ejecuta se anota en `statusHistory.by` (uid). Todas comparten un error propio de estado:

| `HttpsError` | `details.code` | Cuándo |
|---|---|---|
| `not-found` | `ORDER_NOT_FOUND` | el pedido no existe |
| `failed-precondition` | `INVALID_TRANSITION` | la transición no está en la tabla de data-model.md 6 (el mensaje indica el estado actual) |

### 4.1 `confirmTransferPayment`
```ts
interface ConfirmTransferRequest { orderNumber: string; reference?: string /* <=100 */; note?: string /* <=300 */ }
interface ConfirmTransferResponse { orderNumber: string; paymentStatus: 'paid' | 'payment_review'; alreadyPaid: boolean; fulfillmentStatus: FulfillmentStatus | null }
```
- Solo `paymentMethod == "transfer"` (`ORDER_NOT_TRANSFER`).
- `pending_payment → paid` (confirma la venta como en `flowConfirm`, con métricas). `expired` → re-reserva; si no hay stock, resultado `payment_review` (`NO_STOCK_AFTER_EXPIRY`) y respuesta 200 con ese estado (el dinero ya se recibió). `paid` → `alreadyPaid: true`, sin efectos. `cancelled` y `payment_review` → `INVALID_TRANSITION`.
- Idempotente: se apoya en el estado dentro de la transacción. Escribe `transfer {confirmedBy, confirmedAt, reference, note}`.

### 4.2 `resolvePaymentReview`
```ts
interface ResolvePaymentReviewRequest { orderNumber: string; action: 'accept' | 'cancel'; note: string /* 1..300, obligatoria */ }
interface ResolvePaymentReviewResponse { orderNumber: string; paymentStatus: 'paid' | 'cancelled' }
```
- Solo desde `payment_review`. `accept`: si `stockState == released` re-reserva (si falta stock → `failed-precondition` / `OUT_OF_STOCK` con `sku`; el pedido sigue en revisión), luego `paid`. `cancel`: `cancelled` y libera si estaba `reserved`. El reembolso en Flow se hace a mano fuera del sistema (MVP). Anota `review.resolution`.
- Idempotente por estado: si ya está resuelto, `INVALID_TRANSITION`.

### 4.3 `cancelOrder`
```ts
interface CancelOrderRequest { orderNumber: string; reason: string /* 1..300 */ }
interface CancelOrderResponse { orderNumber: string; paymentStatus: 'cancelled'; stockReleased: boolean }
```
- Solo desde `pending_payment`. Un pedido `paid` **no se cancela**: se reembolsa con `recordManualRefund` (4.6); llamar a `cancelOrder` sobre uno `paid` o `refunded` devuelve `INVALID_TRANSITION`. Libera el stock si `stockState == reserved`. Si Flow ya cobró después, `flowConfirm` lo manda a `payment_review`.
- Si el pedido ya está `cancelled`: responde OK con `stockReleased: false` (idempotente).

### 4.4 `updateFulfillment` (estado logístico)
```ts
interface UpdateFulfillmentRequest {
  orderNumber: string;
  to: FulfillmentStatus;
  note?: string;       // <= 300
  reason?: string;     // 1..300. OBLIGATORIO si `to` es un retroceso (D-024)
}
interface UpdateFulfillmentResponse {
  orderNumber: string;
  fulfillmentStatus: FulfillmentStatus;
  changed: boolean;
  direction: 'forward' | 'backward' | 'none';
}
```
- Exige `paymentStatus == "paid"` (`ORDER_NOT_PAID`; un pedido `refunded` tampoco se puede mover). Transiciones permitidas: ver data-model.md 6.2. Hacia adelante: `ready_for_pickup` solo en retiro, `on_route` solo en despacho. **Hacia atrás: solo el admin y solo de a un paso** (`delivered` a `ready_for_pickup` u `on_route` según el tipo de entrega; `ready_for_pickup` u `on_route` a `preparing`), siempre con `reason`: sin él, `invalid-argument` / `REASON_REQUIRED`. Retroceder dos o más pasos, o a `null`: `INVALID_TRANSITION`.
- Cada cambio agrega a `statusHistory` `{kind: "fulfillment", from, to, by: <uid>, note?, reason?, direction?: "backward"}`.
- Pedir el estado actual devuelve `changed: false`, `direction: "none"` (idempotente, sin entrada nueva). No envía correos (D-008).

### 4.5 `releaseExpiredReservations`
- Tipo: scheduled, `every 5 minutes`, zona `America/Santiago`, `maxInstances: 1`, `timeoutSeconds: 120`, reintentos desactivados. Autorización: system (Cloud Scheduler). Cloud Scheduler existe solo en Blaze: en dev se prueba llamando a la función de lógica pura desde tests y en el emulador.
- Consulta `orders where paymentStatus == "pending_payment" and reservedUntil <= now` (índice en data-model.md 5), `limit(100)` por ciclo.
- Por cada pedido, **transacción propia**: releer; solo si sigue `pending_payment`, `stockState == "reserved"` y `reservedUntil <= now`: `stock += qty`, `reserved -= qty`, `inStock` recalculado, `stockState = released`, `paymentStatus = expired`, `statusHistory`. Antes de expirar un pedido de Flow que tenga `flow.token`, consulta `getStatus`: si ya está pagado, aplica la rutina de pago en lugar de expirar.
- Idempotente: reejecutar no repone dos veces (lo impide `stockState`). Un fallo en un pedido no impide procesar los demás. No toca `payment_review`.
- (v1.4, M2) **Corte por Flow caído**: antes de expirar un pedido de Flow con `flow.token` se consulta `getStatus` (hasta 10 s). Tras **3 errores seguidos** de Flow en una misma ejecución se corta el ciclo (el resto queda para la siguiente, 5 minutos después); un resultado sin error reinicia la cuenta.
- Costo: 8.640 invocaciones por mes, con una consulta barata cada una (0 documentos casi siempre). El número de jobs de Cloud Scheduler es 1 (cuota gratuita por VERIFICAR).

---

### 4.6 `recordManualRefund` (registrar un reembolso hecho a mano, D-024 / P5)
(v1.4, B1) Validación agregada: `method: "flow"` solo se acepta si el pedido se pagó con Flow; en uno pagado por transferencia da `INVALID_INPUT`. Lo contrario (un pedido de Flow devuelto por transferencia bancaria) sigue siendo válido.

El dinero se devuelve **fuera del sistema** (panel de Flow o transferencia bancaria). Esta función solo lo **registra** en el pedido; no llama a Flow ni mueve dinero.

```ts
interface RecordManualRefundRequest {
  orderNumber: string;
  amount: Clp;                     // entero, 1..order.total
  method: RefundMethod;            // "flow" | "transfer": por dónde se devolvió el dinero
  refundedAt: string;              // ISO 8601 UTC: cuándo se hizo el reembolso; no puede ser futura (tolerancia 5 min) ni anterior a order.paidAt
  note: string;                    // 1..300, OBLIGATORIA
  restock: boolean;                // true = reponer el stock de los ítems. Obligatorio, sin valor por defecto
}
interface RecordManualRefundResponse {
  orderNumber: string;
  paymentStatus: 'refunded';
  alreadyRefunded: boolean;        // true si ya estaba reembolsado (no se cambió nada)
  restocked: boolean;              // refleja lo guardado en order.refund.restocked
}
```
- Transición única: `paid → refunded` (data-model.md 6.1). Cualquier otro estado de partida: `failed-precondition` / `INVALID_TRANSITION` (con el estado actual en el mensaje). Se puede reembolsar con cualquier estado logístico, incluso `delivered`.
- Una sola transacción (lecturas primero: pedido, productos de los ítems si `restock`, documentos de métricas):
  1. Si el pedido ya es `refunded` → devuelve `alreadyRefunded: true` con lo guardado y **no escribe nada** (ni stock ni métricas), aunque los parámetros de la segunda llamada difieran.
  2. Escribe `paymentStatus = "refunded"`, `refund {amount, method, refundedAt, note, restock, restocked, recordedBy: uid, recordedAt}` y agrega a `statusHistory` `{kind: "payment", from: "paid", to: "refunded", by: <uid>, note, refund: {amount, method, restock}}`.
  3. **Stock**: solo si `restock == true` **y** `stockState == "committed"`: por cada ítem `stock += qty`, `inStock = true`, y `stockState = "released"`, `refund.restocked = true`, más una entrada `kind: "stock"` en `statusHistory`. Con `restock == false`, el stock y `stockState` no cambian (el producto puede haber salido ya). Como `stockState` pasa a `released` en la misma transacción, **no puede reponerse dos veces**, ni siquiera con llamadas concurrentes (la segunda lee `refunded`).
  4. **Métricas** (D-025; una sola regla para reembolsos totales y parciales; usa `refund.restocked`, lo que realmente pasó, no `restock`), con `FieldValue.increment` en la misma transacción:
     - `metrics/daily/days/{fecha de paidAt en America/Santiago}`: `revenue -= refund.amount`, `refundsCount += 1`, `refundedAmount += refund.amount`. `ordersCount` y `merchandise` (mercadería bruta antes de reembolsos) **no cambian**. `unitsSold -= Σqty` solo si `refund.restocked == true`.
     - `metrics/products/items/{sku}` de cada ítem: `unitsSold -= qty` y `revenue -= lineTotal` solo si `refund.restocked == true`; si no, no cambian.
     - Ticket promedio = `revenue / ordersCount` (neto).
- Efectos y revalidación: si repone stock, `onProductWritten` revalida solo si cambió `inStock`. No toca `fulfillmentStatus`. No envía correos (D-008).
- Errores
  | `HttpsError` | `details.code` | Cuándo |
  |---|---|---|
  | `not-found` | `ORDER_NOT_FOUND` | el pedido no existe |
  | `failed-precondition` | `INVALID_TRANSITION` | el pedido no está `paid` (y no es ya `refunded`) |
  | `invalid-argument` | `INVALID_REFUND_AMOUNT` | `amount` no entero, menor que 1 o mayor que `total` |
  | `invalid-argument` | `INVALID_REFUND_DATE` | `refundedAt` futura o anterior a `paidAt` |
  | `invalid-argument` | `INVALID_INPUT` | falta `note`, `restock` o `method`, o están fuera de rango (con `fields`) |
- Un reembolso parcial (`amount < total`) igual deja el pedido `refunded` (terminal), pero las métricas solo bajan según el paso 4 (ingresos en `refund.amount`; unidades solo si se repuso stock); el monto real queda en `refund.amount`.

---

## 5. Funciones del catálogo (admin)

Todas: callable, `admin`, `enforceAppCheck`. **Parte del trabajo se hace en el navegador**: el admin elige el archivo Excel, el navegador lo lee con una librería de planillas (se elige al implementar; el formato `.xls` antiguo exige soporte; VERIFICAR la seguridad y licencia de la librería) y envía las **filas crudas** como JSON. Así el archivo no pasa por Storage, el payload es pequeño (decenas a cientos de filas) y el servidor sigue siendo la autoridad de la validación. Las filas se envían como `string | number | null` sin interpretar.

Tipos comunes
```ts
type Cell = string | number | null;
interface BatchOptions { dryRun?: boolean; fileName?: string }   // dryRun: valida y devuelve el reporte sin escribir ni crear documento en imports
interface InvalidRow { row: number; sku?: string; code: string; message: string }  // row = número de fila de la hoja (1 = encabezado)
interface CorrectedCell { row: number; sku: string; field: string; from: Cell; to: Cell }
interface Warning { sku?: string; code: string; message: string }
interface BatchReport {
  importId: string | null;            // null en dryRun
  dryRun: boolean;
  rows: number;
  created: number; updated: number; unchanged: number; skipped: number;
  corrected: CorrectedCell[];
  invalid: InvalidRow[];
  warnings: Warning[];
  truncated: boolean;                 // listas recortadas a 500 entradas
  changes: PlannedChange[];           // v1.3, aditivo (D-032): vista previa de lo que cambia/cambió; <= 500; no se guarda en imports
}
interface PlannedChange { row: number; sku: string; name: string; field: 'price'|'stock'|'discount'|'create'; from: Cell; to: Cell }
```
Reglas comunes de los lotes
- Máx. **1000 filas** por llamada (`TOO_MANY_ROWS`). Si el archivo tiene más, el cliente lo parte.
- **Aplicación parcial**: las filas válidas se aplican, las inválidas se informan y se omiten. Con `dryRun: true` el admin ve el reporte antes de confirmar.
- Escritura por transacciones de hasta **200 productos** (`stock` y `reserved` se leen y escriben juntos). Un error inesperado en un lote deja los lotes ya aplicados (es seguro repetir: son idempotentes por SKU).
- Cada fila se identifica por SKU **string** `^[A-Za-z0-9_-]{1,32}$`. Un número de Excel como `2427844` o `2427844.0` se convierte a `"2427844"`; uno con decimales reales es inválido (`INVALID_SKU`). SKU repetido en el archivo: la segunda aparición es inválida (`DUPLICATE_SKU`).
- Precios: enteros CLP 1–10.000.000; acepta `"12.990"` o `"$12.990"` con separador de miles chileno; decimales distintos de cero son inválidos (`INVALID_PRICE`).
- Se guarda un reporte en `imports/{id}` (salvo `dryRun`). Errores del lote completo: `TOO_MANY_ROWS`, `EMPTY_BATCH`.
- Cambio de `price`: recalcula `finalPrice`; si un descuento fijo existente deja de ser válido se elimina con advertencia `DISCOUNT_REMOVED`. Es la **única** vez que un lote toca un descuento.
- **Stock vacío, dos casos distintos** (D-024 y D-018): (a) *importación inicial de la planilla* (`importCatalog` creando el producto): stock vacío o negativo pasa a 0 y se informa en `corrected`; (b) **cualquier otro caso** (`importStock`, `updateProductCommerce`, o una fila de `importCatalog` cuyo producto ya existe): una celda **vacía** es fila inválida `EMPTY_STOCK` (no se toca el producto; una celda en blanco no debe dejarlo sin stock por accidente), un texto no numérico es `INVALID_STOCK` y un negativo se corrige a 0 y consta en `corrected`.
- **Productos eliminados (D-029)**: ningún lote revive un producto eliminado. Si el SKU existe con `deletedAt != null`, la fila es inválida con `PRODUCT_DELETED` (no se toca el documento, no se crea otro y el precio, stock, descuento o publicación no cambian). Para volver a usarlo hay que restaurarlo antes con `restoreProducts` (5.9). Vale para `importCatalog`, `importPrices`, `importStock`, `applyDiscount`, `setProductsPublished`, `createProduct` y `updateProductCommerce`.
- **Extensiones v1.3 (D-032)**, todas aditivas (el cliente puede ignorarlas): `changes` en `BatchReport` (arriba); `discountRemoved: boolean` en la respuesta de `updateProductCommerce` (5.7); códigos nuevos de fila `INVALID_PRODUCT_DATA` (documento dañado; el producto no se toca) y `MISSING_NAME` (publicar sin nombre); advertencias nuevas `BARCODE_TOO_LONG` y `PARTIAL_FAILURE` (solo en el registro `imports` de un lote interrumpido).
- **Auditoría (v1.3)**: `imports/{id}` se guarda **después** de las transacciones de productos, no es atómica con ellas. Si un trozo falla tras haber aplicado otros, se guarda un registro parcial con la advertencia `PARTIAL_FAILURE` y se relanza el error; repetir el lote es seguro.
- **Números estrictos (v1.3)**: `"1,000"` y `"1,5"` son inválidos (ambiguos); `"1.000"` es 1000 (miles chilenos); `-0` no se guarda. El servidor manda sobre el prototipo del cliente.
- **Slug único (v1.3)**: el slug debe ser único entre productos **vigentes** (los eliminados no cuentan). Si dos productos ya comparten slug, ninguno se publica hasta cambiar uno.
- **Códigos de fila inválida (v1.3, lista completa)**: `INVALID_SKU`, `DUPLICATE_SKU`, `SKU_NOT_FOUND`, `PRODUCT_DELETED`, `INVALID_PRODUCT_DATA`, `INVALID_NAME`, `INVALID_PRICE`, `INVALID_STOCK`, `EMPTY_STOCK`, `INVALID_ACTIVE`, `DISCOUNT_TOO_HIGH`, `ALREADY_DELETED`, `NOT_DELETED`, `NOT_ACTIVE`, `MISSING_NAME`, `MISSING_SLUG`, `INVALID_SLUG`, `DUPLICATE_SLUG`, `MISSING_DESCRIPTION`, `INVALID_CATEGORY`, `MISSING_IMAGE`. En publicación, `code` es el primer problema y `message` los lista todos.
- Revalidación: cada producto modificado dispara `onProductWritten` (sección 8). Un lote de 150 productos genera ≤150 revalidaciones agrupables; costo despreciable.

### 5.1 `importCatalog` (planilla de Control Farma, D-016, D-018)
```ts
interface CatalogRow {
  ID: Cell;                      // SKU
  NOMBRE: Cell;
  CODIGO_BARRA: Cell;
  STOCK_ACTUAL: Cell;
  PRECIO_VENTA_PUBLICO: Cell;
  ACTIVO: Cell;                  // "SI" | "NO"
  LABORATORIO: Cell;
}
interface ImportCatalogRequest extends BatchOptions { rows: CatalogRow[] }   // hoja ARTICULO
type ImportCatalogResponse = BatchReport;
```
- Fila nueva: crea el producto con `published = false`, `source = "controlfarma-xls"`, `sourceName = NOMBRE` tal cual, `name` propuesto en formato título (el admin lo corrige), `barcode`, `barcodeValid` (dígito verificador GTIN-8/12/13/14), `gtin` (solo si es válido y no empieza con 978/979; si empieza con 978/979 → advertencia `BARCODE_ISBN_RANGE`), `unitsPerPack`/`format`/`family` extraídos del nombre cuando es posible (`X 90`), `stock` (en la **importación inicial**, negativo o vacío → **0** y entrada en `corrected`, D-018), `reserved = 0`, `active` (`SI` → true, `NO` → false, otro valor → fila inválida `INVALID_ACTIVE`), `discount = null`, `finalPrice = price`, `slug = null`.
- Fila existente (**reimportación**, D-024 / P13: Control Farma es la fuente de verdad de precio y stock): **pisa** `price` (+ `finalPrice`) y `stock`, y actualiza `active`, `barcode`/`barcodeValid`/`gtin`, `sourceName`, `importedAt`, `updatedAt`. **Nunca** toca el contenido (`name`, `description`, `shortDescription`, `images`, `slug`, `categoryId`, `seo`, `format`, `unitsPerPack`, `family`, `published`) ni los descuentos (`discount`; solo `DISCOUNT_REMOVED` si un descuento fijo queda inválido por el precio nuevo). Un `STOCK_ACTUAL` vacío en una fila existente es `EMPTY_STOCK` (fila inválida, el stock del producto no cambia). Stock de un producto existente: `stock = max(0, STOCK_ACTUAL - reserved)` (el archivo trae el físico; lo reservado por pedidos pendientes ya no está disponible).
- `LABORATORIO` distinto de "NUTRA ELEMENTS" → advertencia `LABORATORY_MISMATCH`; no bloquea.
- Fila cuyo SKU existe **eliminado** (`deletedAt != null`): fila inválida `PRODUCT_DELETED`; no se crea, no se actualiza ni se revive (D-029). Un producto nuevo se crea con `deletedAt = null` y `deletedBy = null`.
- Idempotente por SKU: repetir la misma planilla da `unchanged`.
- Errores de fila: `INVALID_SKU`, `DUPLICATE_SKU`, `INVALID_NAME`, `INVALID_PRICE`, `INVALID_STOCK` (texto no numérico), `EMPTY_STOCK` (solo en filas de productos existentes), `INVALID_ACTIVE`, `PRODUCT_DELETED`.

### 5.2 `importPrices` (Excel SKU + PRECIO)
```ts
interface PriceRow { SKU: Cell; PRECIO: Cell }
interface ImportPricesRequest extends BatchOptions { rows: PriceRow[] }
type ImportPricesResponse = BatchReport;
```
- Solo actualiza productos **existentes**. SKU inexistente → inválida `SKU_NOT_FOUND` (no crea). SKU eliminado → inválida `PRODUCT_DELETED`. Precio inválido → `INVALID_PRICE`. Recalcula `finalPrice` y aplica la regla de `DISCOUNT_REMOVED`. El nombre de las columnas del Excel: el cliente las busca sin distinguir mayúsculas ("SKU", "PRECIO"); si falta una → el cliente muestra el error antes de llamar.
- Idempotente: mismo precio → `unchanged`.

### 5.3 `importStock` (Excel SKU + STOCK, con reporte de filas inválidas)
```ts
interface StockRow { SKU: Cell; STOCK: Cell }
interface ImportStockRequest extends BatchOptions { rows: StockRow[] }
type ImportStockResponse = BatchReport;
```
- `STOCK` es el stock **físico**; se guarda `stock = max(0, STOCK - reserved)`. Entero 0–1.000.000. Celda **vacía** → fila inválida **`EMPTY_STOCK`** (D-024: **no** se pone 0, para no vaciar el inventario por una celda en blanco; difiere de la importación inicial de la planilla, que sigue D-018). Texto no numérico → `INVALID_STOCK`. Negativo → se corrige a 0 y consta en `corrected`. SKU inexistente → `SKU_NOT_FOUND`. SKU eliminado → `PRODUCT_DELETED`. Las filas inválidas se informan en el reporte y las demás se aplican.
- Recalcula `inStock`. Idempotente.
- Limitación: un archivo de stock aplicado mientras hay compras en curso no pierde reservas, porque resta `reserved`. Si Control Farma ya descontó ventas pagadas que aún están `reserved`/`committed`, hay riesgo de doble descuento: PREGUNTA ABIERTA no bloqueante, a revisar con el jefe (ver sección 11, F6).

### 5.4 `applyDiscount` (descuento por producto y masivo, por lista de SKU)
```ts
interface ApplyDiscountRequest extends BatchOptions {
  skus: Sku[];                                              // 1..150, sin repetidos; un solo SKU = descuento manual de un producto
  discount: { type: 'percent' | 'fixed'; value: number } | null;   // null = quitar el descuento
}
type ApplyDiscountResponse = BatchReport;
```
- `percent`: entero 1–99. `fixed`: entero ≥ 1 y **menor que el precio** de cada producto (si no, esa fila es inválida `DISCOUNT_TOO_HIGH`, porque el precio nunca baja de 0 ni llega a 0). SKU inexistente → `SKU_NOT_FOUND`. SKU eliminado → `PRODUCT_DELETED`.
- **Reemplaza** el descuento anterior (no se acumulan). Calcula `finalPrice` con la fórmula de data-model.md 7.3. `null` deja `finalPrice = price`.
- Aplicación parcial con reporte; `dryRun` disponible (la UI de selección múltiple muestra la vista previa con precio actual → nuevo). Guarda `imports` con `kind: "discount"`.
- Idempotente: mismo descuento → `unchanged`.
- Combinación con envío gratis: el servidor usa el subtotal con descuentos (data-model.md 7.4).

### 5.5 `setProductsPublished`
```ts
interface SetPublishedRequest extends BatchOptions { skus: Sku[]; published: boolean }   // 1..150
type SetPublishedResponse = BatchReport;
```
- Un SKU eliminado (`deletedAt != null`) es fila inválida `PRODUCT_DELETED`, tanto al publicar como al despublicar (ya está despublicado; restaurar primero, 5.9).
- Despublicar: siempre permitido para productos vigentes.
- Publicar: cada producto debe cumplir **todo** esto o la fila es inválida con su código: `active == true` (`NOT_ACTIVE`), `name` no vacío, `slug` válido y **único** (`MISSING_SLUG`, `INVALID_SLUG`, `DUPLICATE_SLUG` — también contra otros SKU del mismo lote), `description` no vacía (`MISSING_DESCRIPTION`), `categoryId` opcional; si no es null, existente y con `published == true` (`INVALID_CATEGORY`, D-040), al menos una imagen con `path` en `products/{sku}/` y `alt` (`MISSING_IMAGE`), `price >= 1` (`INVALID_PRICE`). Fija `publishedAt` la primera vez.
- Un producto publicado sin stock sigue siendo público (se muestra "agotado"); no se despublica solo.
- Idempotente. Revalidación: `onProductWritten` revalida ficha, categoría, `/productos`, `/` y el sitemap.

### 5.6 `createProduct`
```ts
interface CreateProductRequest { sku: Sku; name: string; price: Clp; stock: number; barcode?: string }
interface CreateProductResponse { sku: Sku; created: boolean }
// Firma definitiva v1.3: sku string, name string, price entero CLP, stock entero 0..1.000.000, barcode opcional. Campos desconocidos -> INVALID_INPUT.
```
- Crea con `published = false`, `source = "manual"`. Registra `imports` con `kind: "create"` (`rows: 1`) solo si creó. SKU ya existente → `failed-precondition` / `SKU_EXISTS` (idempotente solo si los datos son idénticos: devuelve `created: false`). Si el SKU existe **eliminado** → `failed-precondition` / `PRODUCT_DELETED` (no se revive; restaurar con `restoreProducts`). Crea con `deletedAt = null` y `deletedBy = null`. El resto de los campos de contenido se completa con escritura directa del admin.

### 5.7 `updateProductCommerce` (precio o stock de un producto)
```ts
interface UpdateProductCommerceRequest { sku: Sku; price?: Cell; stock?: Cell /* físico, como en importStock; Cell para que un stock vacío dé EMPTY_STOCK */; commissionPerUnit?: number | null /* CLP por unidad, 0..10.000.000; null la borra */ }
interface UpdateProductCommerceResponse { sku: Sku; price: Clp; finalPrice: Clp; stock: number /* DISPONIBLE guardado = físico - reservado */; commissionPerUnit: number | null; discountRemoved: boolean /* v1.3 */ }
```
- Al menos uno de los tres campos. `commissionPerUnit` es la comisión del químico en CLP por unidad (data-model 2.1); `createOrder` la congela en cada línea del pedido y las métricas diarias la acumulan al pagar. Mismas reglas que las importaciones. Errores: `SKU_NOT_FOUND` (`not-found`), `PRODUCT_DELETED` (`failed-precondition`, el SKU está eliminado y no se modifica), `INVALID_PRICE`, `INVALID_STOCK`, `EMPTY_STOCK` (stock enviado vacío). Registra `imports` con `kind: "update"` (`rows: 1`) solo si algo cambió.

### 5.8 `grantAdmin` / `revokeAdmin`
```ts
interface AdminClaimRequest { email: string }
interface AdminClaimResponse { uid: string; admin: boolean }
```
- Asigna o quita `admin: true` con el Admin SDK. El usuario debe existir ya en Authentication (`USER_NOT_FOUND`). `revokeAdmin` sobre uno mismo → `failed-precondition` / `CANNOT_REVOKE_SELF`. El usuario debe volver a iniciar sesión (o refrescar el ID token) para que el claim surta efecto. Idempotente.
- **El primer admin** se crea con `claimAdmin` (5.8b, D-031), no con un script. `revokeAdmin` además invalida los refresh tokens del revocado. Errores propios: `NOT_ALLOWED`, `USER_NOT_FOUND`, `CANNOT_REVOKE_SELF`.

### 5.8b `claimAdmin` (bootstrap del primer admin, D-031)
```ts
type ClaimAdminRequest = Record<string, never>;   // sin datos; se ignoran
interface ClaimAdminResponse { admin: true; alreadyAdmin: boolean }
```
- Callable, requiere sesión (no exige claim), `enforceAppCheck`, 256 MiB / 30 s / 2 instancias.
- Asigna `admin: true` con el Admin SDK **solo si** `token.email_verified === true` y el correo del token (en minúsculas y sin espacios) está en el parámetro `ADMIN_EMAILS` (`defineString`, correos separados por comas; no es secreto). Lista vacía = nadie puede reclamar. Conserva los demás claims.
- Si el usuario ya es admin: `alreadyAdmin: true` y no escribe. Idempotente.
- Si no cumple (fuera de la lista, correo sin verificar o sin correo): `permission-denied` / `NOT_ALLOWED`, mensaje fijo que no revela la lista.
- Registra un log estructurado (uid, correo enmascarado, resultado); nunca el correo completo.
- El cliente debe refrescar el token después de la llamada (`getIdToken(true)`) antes de usar el panel: login -> `claimAdmin` -> `getIdToken(true)` -> leer `claims.admin`.
- Con el primer admin, el resto se gestiona con `grantAdmin`/`revokeAdmin` (5.8).

---

### 5.9 `deleteProducts` y `restoreProducts` (eliminación lógica con selección múltiple, D-029)

Callable, `admin`, `enforceAppCheck`, 256 MiB / 60 s / 2 instancias. Eliminar **no borra el documento ni las imágenes** (data-model.md 2.1): fija `deletedAt` y `deletedBy` y despublica. La interfaz de selección múltiple confirma antes de llamar (más de 5 productos exigen escribir `ELIMINAR`); esa confirmación es solo del cliente, el servidor no la repite.

```ts
interface DeleteProductsRequest extends BatchOptions { skus: Sku[] }    // 1..200, SKU con la regex de siempre
interface RestoreProductsRequest extends BatchOptions { skus: Sku[] }   // 1..200
type DeleteProductsResponse = BatchReport;                              // mismo reporte que los otros lotes
type RestoreProductsResponse = BatchReport;
```
- **Límite**: máximo **200 SKU** por llamada. Más de 200 → error global `invalid-argument` / `TOO_MANY_ROWS`; lista vacía → `EMPTY_BATCH`. Si la selección es mayor, el cliente parte la lista. Una escritura por transacción de hasta 200 productos (regla común de los lotes).
- **Respuesta**: `BatchReport` (5, tipos comunes). Cada SKU cambiado cuenta en `updated`; los que ya estaban en el estado pedido salen como fila inválida (`ALREADY_DELETED` / `NOT_DELETED`, ver abajo) y `unchanged` queda en 0; `rows` = SKU recibidos; `row` en `invalid` es la posición del SKU en la lista (1-based). `dryRun` está disponible y no escribe nada ni crea documento. Se guarda `imports/{id}` con `kind: "delete"` o `"restore"` (no `dryRun`): **ese documento es el registro de auditoría** (quién, cuándo y qué SKU).
- **Errores por fila** (van en `invalid`, el resto del lote se aplica):
  | `details.code` | Función | Cuándo |
  |---|---|---|
  | `SKU_NOT_FOUND` | ambas | el SKU no existe |
  | `ALREADY_DELETED` | `deleteProducts` | el producto ya tiene `deletedAt != null` (no se toca nada) |
  | `NOT_DELETED` | `restoreProducts` | el producto ya está vigente (`deletedAt == null`) |
  | `DUPLICATE_SKU` | ambas | SKU repetido en la lista (la segunda aparición) |
  | `INVALID_SKU` | ambas | no cumple la regex del SKU |
- **Error global**: `TOO_MANY_ROWS` (más de 200), `EMPTY_BATCH`, más los comunes de las callables (sin sesión, sin claim, App Check).
- **`deleteProducts` efecto**, por producto vigente y en una transacción: `deletedAt = serverTimestamp`, `deletedBy = uid`, `published = false` (fuerza la despublicación aunque estuviera publicado; si ya estaba despublicado se mantiene), `updatedAt = now`. No cambia `active`, `stock`, `reserved`, precio, descuento, imágenes ni `slug`. Los pedidos con reserva pendiente de ese SKU no se alteran: el stock reservado se libera o confirma como siempre (la liberación escribe `stock`/`reserved` del documento eliminado, lo que es válido).
- **`restoreProducts` efecto**, por producto eliminado: `deletedAt = null`, `deletedBy = null`, `published = false`, `updatedAt = now`. **Queda despublicado**: para volver a la tienda hay que publicarlo con `setProductsPublished` (que revalida todas las condiciones de publicación).
- **Idempotencia**: el estado actual del documento decide. Repetir `deleteProducts` con los mismos SKU deja `ALREADY_DELETED` en cada fila y no escribe nada (`deletedAt` y `deletedBy` originales se conservan, nunca se pisan). Repetir `restoreProducts` da `NOT_DELETED`. Dos llamadas concurrentes sobre el mismo SKU: la transacción relee el estado, así que solo una aplica el cambio.
- **Revalidación ISR** (sección 8): `onProductWritten` detecta el cambio de `published` y `deletedAt` y revalida la ficha `/productos/{slug}` (que pasa a 404), su categoría `/categorias/{categoryId}`, `/productos`, `/` y `/sitemap.xml`. Al restaurar no hay páginas que revalidar porque el producto sigue despublicado (la revalidación posterior ocurre al publicarlo).
- Los productos eliminados siguen siendo legibles por el admin; los pedidos, las métricas y los reembolsos que referencian el SKU siguen funcionando (usan snapshots y el documento se conserva).
- **Borrado físico**: no existe. Si Carlos lo pide más adelante, se agrega como "Vaciar papelera" solo para productos sin pedidos (D-029); cambio de contrato.

---

**Nota (v1.3, QA S-2)**: el admin puede seguir editando el **contenido** de un producto eliminado (campos de escritura directa de data-model.md 2.1); eso no lo revive ni lo publica. Los campos de comercio y `deletedAt`/`deletedBy` siguen siendo solo del servidor.

---

### 5.10 `getFlowCredentialsStatus` y `setFlowCredentials` (credenciales de Flow desde Ajustes, D-035)

Callables, `admin`, `enforceAppCheck`, 256 MiB / 30 s / 2 instancias. **Sin** `secrets: [...]` enlazados: hablan con la API de Secret Manager. Los valores **solo** viven en Secret Manager (`FLOW_API_KEY`, `FLOW_SECRET_KEY`): no se guardan en Firestore, no se devuelven al cliente y no se registran en los logs.

```ts
interface SetFlowCredentialsRequest { apiKey?: string; secretKey?: string }  // al menos una; trim; 8..200 caracteres ASCII imprimibles sin espacios; objeto estricto
interface FlowCredentialStatus { configured: boolean; updatedAt: string | null } // ISO de la última versión habilitada
interface FlowCredentialsStatus {
  apiKey: FlowCredentialStatus & { hint: string | null }  // últimos 4 caracteres de la apiKey
  secretKey: FlowCredentialStatus                         // la secretKey nunca se muestra, ni parcial
}
// getFlowCredentialsStatus: {} -> FlowCredentialsStatus
// setFlowCredentials: SetFlowCredentialsRequest -> FlowCredentialsStatus
```
- **Efecto de `setFlowCredentials`**: agrega una **versión nueva** a cada secreto recibido (no deshabilita ni destruye las anteriores). Registra en el log `uid` y nombres de los secretos, nunca los valores.
- **Lectura en las funciones de pago**: en la nube, `createFlowPayment`, `flowConfirm`, `getOrderStatus` y `releaseExpiredReservations` leen la **última versión** con caché de 60 s por instancia; si Secret Manager falla, usan el último valor leído y, si no hay, la versión fijada en el despliegue. En `local` solo se usa la versión fijada (`functions/.secret.local`). La guarda de ambiente (3.3.1) sigue igual: credenciales de producción con `APP_ENV=staging` no sirven porque la base sigue siendo el sandbox.
- **Errores** (`failed-precondition`): `FLOW_SECRETS_LOCAL` (emulador, o sin proyecto), `FLOW_SECRET_MISSING` (el secreto no existe en Secret Manager), `FLOW_SECRET_FORBIDDEN` (falta IAM). Más los comunes (sin sesión, sin claim, App Check, `INVALID_INPUT`).
- **IAM requerido** (lo configura devops con confirmación de Carlos): la cuenta de servicio de Functions necesita, sobre ambos secretos, `roles/secretmanager.secretAccessor` y `roles/secretmanager.secretVersionManager`.

---

## 6. Métricas

- No hay función propia: las actualiza la transacción que marca un pedido como `paid` (`flowConfirm`, `getOrderStatus` por reconciliación, `confirmTransferPayment`, `resolvePaymentReview`), con `FieldValue.increment`, en `metrics/daily/days/{fecha en America/Santiago}` y `metrics/products/items/{sku}`. Como la transición solo ocurre una vez, no se cuenta doble. `recordManualRefund` **ajusta** las métricas en su propia transacción (4.6, regla D-025): `revenue -= refund.amount`, `refundsCount += 1`, `refundedAmount += refund.amount`, y unidades (diarias y por SKU) solo si `refund.restocked == true`; `ordersCount` y `merchandise` no cambian. También ocurre una sola vez.
- El panel las lee directo con la regla de admin (data-model.md 2.6). "Sin stock": consulta a `products`.
- Reconstrucción de métricas (función `rebuildMetrics`) **fuera del MVP**; si un cálculo falla, se corrige a mano. Ver F7 (sección 11).

---

## 7. Variables y secretos por ambiente (solo nombres; los valores nunca van en archivos versionados)

### 7.1 Cloud Functions

| Nombre | Tipo | local (emuladores) | staging / production (proyecto `nutraelements`) |
|---|---|---|---|
| `FLOW_API_KEY` | **secreto** | `functions/.secret.local` (no versionado; VERIFICAR) o `.env` | Secret Manager (`defineSecret`). Lo carga Carlos, o un admin desde Ajustes (5.10, D-035). En staging: credencial sandbox; en production: credencial de producción |
| `FLOW_SECRET_KEY` | **secreto** | igual | Secret Manager |
| `REVALIDATE_SECRET` | **secreto** | igual (cualquier valor aleatorio local) | Secret Manager |
| `ADMIN_EMAILS` | parámetro (no secreto) | `functions/.env.local` | lista de correos de admins iniciales (minúsculas, separados por comas); `functions/.env.<alias>` o pregunta del CLI |
| `APP_ENV` | parámetro | `local` | `staging` o `production` |
| `SITE_URL` | parámetro | `http://localhost:3000` | URL de App Hosting o `https://nutraelements.cl` |
| `FLOW_API_BASE` | parámetro | `https://sandbox.flow.cl/api` | sandbox en staging; producción en production |
| `FLOW_CONFIRMATION_URL` | parámetro | URL pública del túnel + `/nutraelementsdev/us-east4/flowConfirm` | URL de `flowConfirm` desplegada |

- Dev (`nutraelementsdev`, Spark) no tiene Secret Manager ni Functions en la nube (D-021, D-009): todo es local. Los valores locales viven en archivos ya ignorados por git (`.env`, `functions/.env.*`, `functions/.secret.local`); devops/qa-reviewer comprueban con `git check-ignore` antes de cada push (D-013, D-020). La ubicación exacta de los `.env` para el emulador de Functions (carpeta `functions/` frente a la raíz) se confirma en 2B.1.
- Los parámetros no secretos (`SITE_URL`, etc.) pueden ir en `functions/.env.<alias>` **sin valores sensibles**; las URLs de producción no son secretas.
- Plantilla: `.env.example` con **solo los nombres**.

### 7.2 Next.js (App Hosting)

| Nombre | Tipo | Notas |
|---|---|---|
| `REVALIDATE_SECRET` | **secreto** | Mismo valor que el de Functions; se declara en `apphosting.yaml` como secreto de Secret Manager (prod) y en `.env.local` (local) |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | pública | Configuración web de Firebase. No son secretos, pero los valores van por ambiente |
| `NEXT_PUBLIC_USE_EMULATORS` | pública | `true` solo en local |
| `NEXT_PUBLIC_APPCHECK_SITE_KEY` | pública | Clave del proveedor de App Check. En local se usa el token de depuración (variable `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` solo en `.env.local`) |
| `SITE_URL` | servidor | URL base canónica (sitemap, JSON-LD) |

Next.js usa el Admin SDK en el servidor con las credenciales por defecto de App Hosting (sin archivos de clave). Nada de credenciales de servicio en el repo.

---

## 8. Triggers y revalidación ISR bajo demanda (D-022)

### 8.1 Triggers
- `onProductWritten` (`onDocumentWritten("products/{sku}")`): compara `before` y `after`. Solo si cambió algo **visible en el sitio** (`name`, `slug`, `description`, `shortDescription`, `categoryId`, `images`, `price`, `discount`, `finalPrice`, `inStock`, `published`, `active`, `deletedAt`, `format`, `unitsPerPack`, `family`, `seo`, `gtin`) llama a revalidar. Un producto que pasa a eliminado (`deletedAt` deja de ser null, que a la vez fuerza `published = false`) revalida su ficha `/productos/{slug}` (ahora 404), su categoría y el listado; un producto eliminado que sigue eliminado no revalida nada. Los cambios solo en `stock`/`reserved` sin cambiar `inStock` **no** revalidan (evita una revalidación por cada compra). Rutas: `/productos/{slug}` (el actual y el anterior si cambió o se despublicó), `/categorias/{categoryId}` (y la anterior), `/productos`, `/`, `/sitemap.xml`.
- `onCategoryWritten`: rutas `/categorias/{id}`, `/productos`, `/`, `/sitemap.xml`.
- `onSettingsPublicWritten`: cambia el umbral de envío gratis o el retiro → revalidar `/`, `/productos`, `/preguntas-frecuentes`, `/contacto` y `/productos/*` mediante una **etiqueta** (`tags: ["settings"]`; las fichas con la oferta de envío en el JSON-LD usan esa etiqueta).
- Los triggers son at-least-once: la revalidación es idempotente. Si la llamada a Next falla, se registra y no se propaga el error. **Reintento acotado (v1.3, D-032)**: 3 intentos dentro de la misma ejecución (esperas de 0,5 s y 1,5 s, timeout de 5 s por intento, timestamp nuevo en cada uno), solo ante error de red, timeout, 429 o 5xx; el trigger no usa `retry` de la plataforma. Si los 3 fallan, el vencimiento normal de ISR corrige después (ver `revalidate` de las páginas, definido por nextjs-frontend). Ningún trigger escribe en Firestore.

### 8.2 Ruta de Next.js que recibe la revalidación

`POST {SITE_URL}/api/revalidate` (route handler). Contrato que implementa nextjs-frontend:

```ts
// Cuerpo JSON
interface RevalidateRequestBody {
  paths?: string[];   // rutas concretas, máx. 50. Solo rutas públicas (ver lista blanca)
  tags?: string[];    // etiquetas, máx. 10. Lista blanca: "catalog", "settings"
}
// Cabeceras
//   x-ne-timestamp: <epoch en segundos, string>
//   x-ne-signature: <hex de HMAC-SHA256(REVALIDATE_SECRET, `${timestamp}.${cuerpoCrudo}`)>
// Respuesta: 200 { revalidated: true, paths: string[], tags: string[] } | 400 | 401
```
- Verificación: leer el cuerpo **crudo**, recalcular el HMAC y compararlo en tiempo constante (`timingSafeEqual`); rechazar con `401` si falta alguna cabecera, si la firma no coincide o si el timestamp se aleja más de **5 minutos** del reloj del servidor. Un reenvío dentro de esa ventana es inofensivo (revalidar es idempotente). `400` si el cuerpo no cumple el tipo. Respuestas sin detalle de por qué falló la firma.
- Lista blanca de rutas: `/`, `/productos`, `/productos/<slug>`, `/categorias/<slug>`, `/nosotros`, `/contacto`, `/preguntas-frecuentes`, `/sitemap.xml`, y las páginas legales; `<slug>` con `^[a-z0-9-]{1,80}$`. Cualquier otra ruta → `400`. Nunca `/admin`, `/checkout`, `/api`.
- Este endpoint **no** usa cookies ni App Check; el secreto compartido es la única autenticación. Si el secreto se filtra, cámbiese en Secret Manager (Functions y App Hosting) y se despliega de nuevo. No se acepta el secreto en la URL ni en la query.
- Llamada desde Functions: `fetch` con timeout de 5 s a `SITE_URL + "/api/revalidate"`, firma con `REVALIDATE_SECRET`. En local, `SITE_URL=http://localhost:3000`. Si `SITE_URL` no está definida, el trigger se salta la revalidación y lo registra.
- Responsabilidad de nextjs-frontend: marcar con ISR las páginas listadas y usar las etiquetas `catalog` y `settings` en sus lecturas si usa etiquetas (si solo usa rutas, ignora `tags`).

---

## 9. Tests (Emulator Suite) — qué se prueba y cómo

Cada pieza lleva su test; ninguna pasa a QA sin ellos en verde.

1. **Reglas** (`@firebase/rules-unit-testing`, Firestore y Storage): la lista de data-model.md 9.
2. **Concurrencia del stock** (`createOrder`): stock 1, 10 compradores en paralelo → exactamente un pedido y nueve `OUT_OF_STOCK`; el `stock` final es 0 y `reserved` es 1; los números de pedido son consecutivos y sin repetirse (contador); stock 5 con compras de 2 en paralelo → no sobrevende.
3. **Manipulación del precio**: el request nunca acepta `price`, `total`, `shipping` ni `discount` (campos desconocidos → `INVALID_INPUT`); con descuento activo, el snapshot usa `finalPrice` recalculado; modificar a mano `finalPrice` en el documento no cambia lo cobrado (se recalcula desde `price` y `discount`); envío gratis solo con umbral definido y `subtotal` con descuentos; retiro = 0; comuna fuera de lista rechazada; cantidades fuera de rango rechazadas.
4. **Fórmulas**: tabla de casos de `computeFinalPrice` (porcentaje con redondeo de mitades hacia arriba, fijo, clamp a 0, 99%, `fixed == price - 1`).
5. **Idempotencia de `createOrder`**: mismo `clientRequestId` dos veces → un solo pedido, un solo descuento de stock y el mismo token (v1.4: el reintento no invalida el token ya entregado).
6. **Idempotencia de Flow** (`flowConfirm`, con `getStatus` simulado): (a) pago correcto → `paid`, `fulfillmentStatus = preparing`, métricas +1; (b) la misma confirmación 5 veces (también en paralelo) → un solo `paid`, métricas +1, `receivedCount = 5`; (c) monto distinto → `payment_review`, sin `paid`; (d) pago tardío con stock → `paid`; (e) pago tardío sin stock → `payment_review`; (f) pedido cancelado → `payment_review`; (g) `getStatus` con firma o token inválidos → 400 sin cambios; (h) estado pendiente o rechazado → el pedido sigue `pending_payment`.
7. **Firma de Flow**: prueba unitaria de la firma con vectores de la documentación oficial de Flow (VERIFICAR al implementar).
8. **Reservas**: vencimiento libera una vez (dos ejecuciones seguidas = misma cantidad); no libera `payment_review` ni `paid`; con un `flow.token` ya pagado, aplica el pago en vez de expirar.
9. **Transferencia y estados**: toda la matriz de transiciones de pago de data-model.md 6.1 (permitidas y prohibidas, incluidas las que parten de `refunded`) y de 6.2 (`updateFulfillment` por tipo de entrega; retroceso de un paso solo admin con `reason`; sin `reason` → `REASON_REQUIRED`; retroceso de dos pasos → `INVALID_TRANSITION`; el retroceso queda en `statusHistory` con `direction: "backward"`; mismo estado → `changed: false`).
9b. **`recordManualRefund`**: (a) `paid` con `restock: true` y `amount == total` → `refunded`, `stock` repuesto, `stockState = released`, `refund.restocked == true`, `refund` y `statusHistory` completos; métricas: diario `revenue -total`, `refundsCount +1`, `refundedAmount +total`, `unitsSold -Σqty`, `ordersCount` y `merchandise` intactos; por SKU `unitsSold -qty` y `revenue -lineTotal`; (a2) igual con `restock: true` y `amount < total`: `revenue` baja solo `amount`, `refundedAmount +amount`, unidades diarias y por SKU sí se restan (porque `restocked == true`); (b) `restock: false` y `amount == total` → stock intacto, `stockState = committed`, `refund.restocked == false`; métricas: diario `revenue -total`, `refundsCount +1`, `refundedAmount +total`, `unitsSold` intacto, `ordersCount` y `merchandise` intactos; por SKU sin cambios; (b2) **reembolso parcial** `amount < total` con `restock: false` → `revenue` diario baja solo `amount`, `refundsCount +1`, `refundedAmount +amount`, `unitsSold`, `ordersCount` y `merchandise` intactos, métricas por SKU intactas; el ticket promedio resultante es `revenue / ordersCount` (neto); (b3) el reembolso se asienta en el día de `paidAt` aunque `refundedAt` caiga otro día; (b4) con `restock: true` pero `stockState != committed` (restocked false) las unidades no se tocan: ver nota en el handoff sobre su alcance; (c) misma llamada 5 veces, también en paralelo → una sola reposición y un solo ajuste de métricas, `alreadyRefunded: true` en las demás; (d) desde `pending_payment`, `expired`, `cancelled`, `payment_review` → `INVALID_TRANSITION`; (e) `amount` 0, negativo, decimal o mayor que `total` → `INVALID_REFUND_AMOUNT`; (f) `refundedAt` futura o anterior a `paidAt` → `INVALID_REFUND_DATE`; (g) sin `note` o sin `restock` → `INVALID_INPUT`; (h) sin sesión y sin claim → `UNAUTHENTICATED` / `NOT_ADMIN`; (i) tras `refunded`, `updateFulfillment`, `cancelOrder` y `confirmTransferPayment` fallan; (j) `getOrderStatus` devuelve `refunded` sin `refund` ni RUT.
10. **`getOrderStatus`**: token incorrecto y número inexistente dan la misma respuesta; la respuesta **no contiene** email, teléfono, dirección ni RUT (comparación contra una lista de campos prohibidos); límite de intentos (los valores salen de `settings/private.limits`).
10b. **RUT** (`createOrder`): tabla de casos de módulo 11 (dígito verificador 0-9 y K, con y sin puntos, `k` minúscula, mal dígito, vacío, muy corto o con letras) → `INVALID_RUT`; el valor guardado queda normalizado `12345678-K`; el RUT no aparece en los logs (se espía `logger`).
11. **Lotes de Excel**: filas inválidas se informan y no se aplican; importación inicial D-018 (stock -5 y vacío → 0 con `corrected`); `importStock` con celda vacía → `EMPTY_STOCK` (producto sin cambios) y con negativo → 0 corregido; una fila existente de `importCatalog` con stock vacío → `EMPTY_STOCK`; reimportar pisa `price` y `stock`, es idempotente y no toca `name`/`slug`/`images`/`categoryId`/`published`/`discount`; `DISCOUNT_REMOVED`; `applyDiscount` con `dryRun`.
12. **Publicación**: cada validación de `setProductsPublished` falla con su código; slug duplicado.
12b. **Eliminación lógica (`deleteProducts` / `restoreProducts`, D-029)**:
   - (a) eliminar un producto publicado → `deletedAt` con fecha, `deletedBy` = uid, `published == false`; el documento y `images` siguen; `stock`, `price`, `active` intactos; `imports` con `kind: "delete"` y `createdBy`.
   - (b) eliminar un lote mixto (existente, inexistente, ya eliminado, repetido, SKU inválido) → solo los válidos se aplican; las filas inválidas salen con `SKU_NOT_FOUND`, `ALREADY_DELETED`, `DUPLICATE_SKU` e `INVALID_SKU`.
   - (c) 200 SKU pasan; 201 → `TOO_MANY_ROWS` sin cambios; lista vacía → `EMPTY_BATCH`.
   - (d) idempotencia: repetir `deleteProducts` 3 veces, también en paralelo → un solo `deletedAt`/`deletedBy` (los originales no se pisan) y `ALREADY_DELETED` en el resto; repetir `restoreProducts` → `NOT_DELETED`.
   - (e) `restoreProducts` → `deletedAt == null`, `deletedBy == null`, `published == false` (no vuelve publicado); restaurar un vigente → `NOT_DELETED`; SKU inexistente → `SKU_NOT_FOUND`.
   - (f) `dryRun: true` → reporte sin escribir ni crear `imports`.
   - (g) un SKU eliminado en `importCatalog`, `importPrices`, `importStock`, `applyDiscount`, `setProductsPublished` (publicar y despublicar), `createProduct` y `updateProductCommerce` → `PRODUCT_DELETED`, sin cambiar precio, stock, descuento, `published` ni `deletedAt`; el resto del lote se aplica.
   - (h) `createOrder` con un SKU eliminado → `PRODUCT_UNAVAILABLE`, igual que con uno no publicado, y sin descontar stock del resto del carrito (transacción completa).
   - (i) un pedido existente de un SKU eliminado sigue siendo legible, y `recordManualRefund` con `restock: true` sobre ese pedido repone stock en el documento eliminado sin revivirlo.
   - (j) autorización: sin sesión → `UNAUTHENTICATED`, sin claim → `NOT_ADMIN`, admin → OK.
   - (k) el trigger `onProductWritten` llama a revalidar con la ficha y la categoría cuando un producto publicado se elimina, y no llama cuando solo cambia `stock` de un producto eliminado.
13. **Autorización**: cada función admin (incluidas `recordManualRefund`, `deleteProducts` y `restoreProducts`) con (a) sin sesión, (b) sesión sin claim, (c) admin. App Check se prueba en integración con el emulador (token de depuración).
14. **Revalidación**: unidad de la firma HMAC (válida, adulterada, expirada) y de la lista blanca; el trigger solo llama cuando cambia un campo visible.

---

## 10. Lo que necesita nextjs-frontend de este contrato (resumen)

- Cliente de Functions con región `us-east4`; App Check activo en producción (token de depuración en local).
- `createOrder` → guardar `orderNumber` y `accessToken` (memoria o `sessionStorage`; **no** `localStorage` de larga duración). Flow: `createFlowPayment` y redirigir a `redirectUrl`. Transferencia: mostrar la pantalla con instrucciones usando `getOrderStatus`.
- Ruta `/checkout/retorno` (GET y POST, 303) y página de confirmación con polling a `getOrderStatus`; mostrar el número `NE-xxxxxx` y el aviso de seguimiento en DispatchTrack (D-008, D-007). Páginas con `noindex`.
- Ruta `POST /api/revalidate` con la verificación HMAC de 8.2.
- Lecturas públicas con Admin SDK en el servidor (ISR); sin listeners en el sitio público; admin con paginación.
- Checkout: campo **RUT obligatorio** (validar módulo 11 en el cliente también; el servidor es la autoridad y responde `INVALID_RUT`); no hay razón social ni giro.
- Subida de imágenes a Storage directamente desde el navegador (admin), **comprimidas a WebP con el lado largo ≤ 1600 px y máx. 2 MiB**, y lectura de Excel en el navegador.
- Admin (D-029): selección múltiple con checkbox y "seleccionar todos" sobre la lista filtrada; `deleteProducts({skus})` con diálogo de confirmación (cuántos se eliminan; más de 5 exige escribir `ELIMINAR`); máximo 200 por llamada (el cliente parte la selección); mostrar el reporte por fila (`ALREADY_DELETED`, `SKU_NOT_FOUND`, etc.); filtro "Eliminados" (`where("deletedAt","!=",null)`) con la acción "Restaurar" (`restoreProducts`; el producto vuelve despublicado); la lista normal excluye eliminados (`deletedAt == null`). Las importaciones muestran `PRODUCT_DELETED` como fila inválida.
- Consultas públicas (si alguna usa el SDK cliente) y todas las del servidor de Next.js: agregar `where("deletedAt","==",null)`; una ficha con `deletedAt != null` responde 404.
- Admin: etiqueta "Reembolsado" para `refunded`; formulario de `recordManualRefund` (monto, medio, fecha, nota, casilla "reponer stock"); retroceder el estado logístico pide un motivo.

---

## 11. PREGUNTAS ABIERTAS de este contrato

Del modelo de datos, siguen abiertas solo P2 (reservas configurables, pendiente del jefe) y P7 (retención de datos, después del lanzamiento); ver data-model.md sección 10.

Propias de las funciones, no bloquean la v1:
- F1. Número y nombre exactos de los parámetros, la firma, los estados, los reintentos y la forma del retorno de Flow: **no verificados**; se leen en la documentación oficial al implementar 2B.4.
- F3. Cómo se entera el admin de que hay un pedido en `payment_review` sin correos (propuesta: contador y filtro destacado en el panel de pedidos).
- F4. Recuperación del número o token de pedido perdido (no existe con D-008).
- F6. Relación entre el stock físico de Control Farma y las reservas o ventas aún no facturadas (riesgo de doble descuento).
- F7. ¿Hace falta una función para reconstruir métricas desde los pedidos?
- F8. Herramienta de túnel para probar Flow en local (se elige en la tarea de Flow con aprobación de Carlos, D-021).

## 12. Resueltas (referencia: D-024)

| # | Tema | Resolución |
|---|---|---|
| F2 | Límites anti-abuso | 5 pedidos / 10 min por IP, 3 pendientes por correo, 120 consultas / 10 min por IP (v1.4) y 10 fallos por número en `getOrderStatus`: valores iniciales aceptados, configurables en `settings/private.limits` |
| F5 | Celda vacía en el Excel de stock | Fila inválida `EMPTY_STOCK`, no 0. La importación inicial de la planilla sigue D-018 (5, 5.1 y 5.3) |
| P5 | Pedido pagado que se reembolsa | `recordManualRefund` (4.6): `paid → refunded`, terminal, reposición opcional, métricas ajustadas según D-025 (ingresos menos `refund.amount`; unidades solo si se repuso stock) |
| P6 | RUT | Obligatorio, módulo 11 en `createOrder`, `INVALID_RUT`, normalizado, nunca expuesto |
| P9 | Retroceder estado logístico | Solo admin, un paso, con `reason` obligatorio (`updateFulfillment`, 4.4) |
| P11 | Envío gratis | `>=` sobre el subtotal con descuentos |
| P12 | Login del admin | Correo y contraseña, auto-registro desactivado, MFA después del lanzamiento (data-model.md 3) |
| P13 | Reimportar la planilla | Pisa precio y stock; nunca toca contenido ni descuentos (5.1) |
