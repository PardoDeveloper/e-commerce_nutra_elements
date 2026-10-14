# Contrato del modelo de datos (Firestore y Storage) — Nutra Elements

Tarea 2A.1. Autor: firebase-architect. Estado: **v1.1 — D-025 aplicada (2026-10-14)** (v1 aprobada por tech-lead el 2026-10-14, D-024). Es el contrato con nextjs-frontend: no se cambia sin aprobación.
Decisiones que lo respaldan: D-004, D-005, D-006, D-007, D-008, D-010, D-011, D-012, D-016, D-018, D-020, D-021, D-022, D-023, D-024. Requisitos de negocio: DESCUBRIMIENTO.md.
Contrato hermano (funciones): [functions.md](functions.md).

Convenciones
- Firestore en modo Native, región `us-east4`. Una sola base `(default)` por proyecto (dev = `nutraelementsdev`, prod = `nutraelements`).
- Dinero: **CLP como entero** (sin decimales, sin `number` con coma). Moneda siempre `"CLP"` en los snapshots.
- Fechas: `Timestamp` de Firestore. En las respuestas de las Functions se envían como string ISO 8601 UTC. La "fecha de negocio" (métricas) usa la zona `America/Santiago`.
- Nombres de campo en inglés, camelCase. Textos para mostrar, en español.
- Los clientes **no escriben nunca** `createdAt`/`updatedAt` libremente: las reglas exigen `== request.time`.
- "Servidor" = Cloud Functions con Admin SDK (las reglas no se le aplican). "Admin" = usuario con custom claim `admin: true` (D-011), un solo rol. "Público" = cualquiera, sin sesión.
- No hay colecciones `users` ni `posts`: cuentas de cliente y blog quedan para la Fase 3 (D-015). Auth contiene solo administradores.
- Todo lo que no figure en este documento está **denegado** por las reglas (`match /{document=**} { allow read, write: if false; }` al final).

---

## 1. Resumen de colecciones

| Ruta | ID del documento | Para qué | Quién escribe |
|---|---|---|---|
| `products/{sku}` | SKU = ID de Control Farma, **string** (D-016) | Catálogo, precio, descuento y stock | Servidor (precio, descuento, stock, publicación); admin directo (solo campos de contenido) |
| `categories/{categoryId}` | slug de la categoría | Categorías | Admin directo |
| `orders/{orderNumber}` | `NE-000123` (D-007) | Pedidos con snapshot de precios y reserva | Solo servidor |
| `counters/orders` | fijo `orders` | Contador del número de pedido (el primero es NE-000001) | Solo servidor |
| `settings/public` | fijo | Ajustes visibles al público (envío, comunas, tienda) | Admin directo |
| `settings/private` | fijo | Datos bancarios y tiempos de reserva | Admin directo |
| `metrics/daily/days/{YYYY-MM-DD}` | fecha en `America/Santiago` | Ventas por día | Solo servidor |
| `metrics/products/items/{sku}` | SKU | Ventas por producto | Solo servidor |
| `imports/{importId}` | ID automático | Reportes de importaciones y de operaciones masivas | Solo servidor |
| `paymentEvents/{flowToken}` | token que envía Flow | Idempotencia y auditoría de las confirmaciones de Flow | Solo servidor |
| `idempotencyKeys/{sha256(clientRequestId)}` | hash hex | Idempotencia de `createOrder` | Solo servidor |
| `rateLimits/{key}` | hash hex | Límite de intentos de las Functions públicas | Solo servidor |

Las reservas **no tienen colección propia**: viven en el pedido (`reservedUntil`, `stockState`, `items[]`). Menos escrituras y una sola transacción.

---

## 2. Colecciones

### 2.1 `products/{sku}`

ID del documento = `sku`. Siempre texto (`"2427831"`), nunca número, para no perder ceros ni precisión al leer el Excel. Regex del SKU: `^[A-Za-z0-9_-]{1,32}$` (seguro como ID de Firestore, sin `/`).

| Campo | Tipo | Oblig. | Validación | Quién escribe y cuándo |
|---|---|---|---|---|
| `sku` | string | sí | igual al ID del documento | Servidor, al crear (import o `createProduct`). Inmutable |
| `sourceName` | string | sí | 1–200 caracteres. NOMBRE original de la planilla, tal cual (D-018) | Servidor, en importación. Solo lectura para el admin |
| `name` | string | sí | 1–120 caracteres. Nombre para mostrar | Servidor lo propone en formato título al crear; el admin lo edita (directo) |
| `slug` | string \| null | no hasta publicar | `^[a-z0-9]+(-[a-z0-9]+)*$`, máx. 80. **Único** entre productos (se valida al publicar). Inmutable mientras `published == true` (regla) | Admin directo (solo si `published == false`) |
| `description` | string \| null | no hasta publicar | máx. 5000. Texto plano. Sin afirmaciones de curar, tratar o prevenir (AGENTS.md) | Admin directo |
| `shortDescription` | string \| null | no | máx. 300 | Admin directo |
| `categoryId` | string \| null | no hasta publicar | debe existir en `categories` y estar publicada al publicar | Admin directo (la regla verifica que exista). Valores iniciales de `categories`: ver 2.2 |
| `images` | array de `{path, alt}` | no hasta publicar | 0–8 elementos. `path`: ruta en Storage `products/{sku}/{imageId}.{ext}`. `alt`: 1–140. La primera es la principal | Admin directo (después de subir el archivo a Storage) |
| `price` | int | sí | 1–10.000.000. Precio de lista en CLP | Servidor (import, `importPrices`, `updateProductCommerce`) |
| `discount` | map \| null | no | `{type: "percent"\|"fixed", value: int}`. `percent`: 1–99. `fixed`: 1 a `price-1`. Sin fechas de vigencia en el MVP | Servidor (`applyDiscount`) |
| `finalPrice` | int | sí | `0 ≤ finalPrice ≤ price`. **Siempre derivado** (ver sección 7.3). Es el precio que cobra el servidor | Servidor, cada vez que cambia `price` o `discount` |
| `stock` | int | sí | `>= 0`. **Unidades disponibles para vender** (ya descontadas las reservadas) | Servidor: `createOrder` (resta), liberación y cancelación (suma), importaciones |
| `reserved` | int | sí | `>= 0`. Unidades reservadas por pedidos con pago pendiente | Servidor, en las mismas transacciones que `stock` |
| `inStock` | bool | sí | `stock > 0`. Derivado, para consultas y para decidir la revalidación | Servidor |
| `active` | bool | sí | De la columna ACTIVO (SI = true) | Servidor (import, `createProduct`) |
| `published` | bool | sí | `false` al importar. Solo pasa a `true` con las validaciones de `setProductsPublished` | Servidor |
| `publishedAt` | Timestamp \| null | no | primera publicación | Servidor |
| `barcode` | string \| null | no | CODIGO_BARRA tal cual | Servidor, en importación |
| `barcodeValid` | bool | sí | dígito verificador GTIN-8/12/13/14 correcto | Servidor, en importación |
| `gtin` | string \| null | no | solo si `barcodeValid` y **no** empieza con 978 o 979 (ISBN). El JSON-LD usa `gtin` y omite el campo si es null | Servidor, en importación |
| `format` | string \| null | no | enum abierto, hoy `"capsulas"` | Servidor propone al importar; admin directo |
| `unitsPerPack` | int \| null | no | 1–1000 (30, 60, 90, 120…). Se extrae de "X 90" en el nombre | Servidor propone; admin directo |
| `family` | string \| null | no | slug que agrupa los tamaños de un mismo producto (ej. `citrato-de-magnesio`). Cada tamaño es su propio producto y SKU. Sin variantes dentro de un producto | Servidor propone; admin directo |
| `seo` | map \| null | no | `{title?: string ≤ 70, description?: string ≤ 170}` | Admin directo |
| `source` | string | sí | `"controlfarma-xls"` o `"manual"` | Servidor |
| `importedAt` | Timestamp \| null | no | última importación que lo tocó | Servidor |
| `createdAt` | Timestamp | sí | | Servidor |
| `updatedAt` | Timestamp | sí | | Servidor o admin directo (regla: `== request.time`) |

`brand` no se guarda: es la constante "Nutra Elements" (todos los productos son de línea propia) y va en el JSON-LD desde código. Los campos de reseñas (`ratingAvg`, `reviewCount`) **no existen en el MVP** (D-014): el frontend no emite `aggregateRating`. Cuando haya reseñas reales (Fase 3) se agregan.

Notas
- El documento completo es de lectura pública cuando `published && active` (ver la matriz). Eso expone `stock` y `reserved`; es aceptable (el stock de un suplemento no es sensible) y evita duplicar documentos. Si Carlos prefiere ocultarlos, se parte el documento (cambio de contrato).
- La consulta pública **debe** incluir `where("published","==",true)` y `where("active","==",true)`; las reglas rechazan consultas sin esas condiciones.
- Un producto **no se borra**: se despublica (`published=false`) o se desactiva. Los pedidos tienen snapshot, pero el SKU debe seguir resolviendo para métricas y reimportaciones.

Ejemplo (SKU, nombre y precio reales de la planilla; el código de barras es **ficticio**. El SKU 2427844 es la Vitamina B12 x 90 caps, categoría `vitaminas`)
```json
{
  "sku": "2427831",
  "sourceName": "CITRATO DE MAGNESIO X 120 CAPS",
  "name": "Citrato de Magnesio x 120 cápsulas",
  "slug": "citrato-de-magnesio-120-capsulas",
  "description": "Suplemento alimentario en cápsulas...",
  "shortDescription": "Citrato de magnesio, 120 cápsulas.",
  "categoryId": "magnesio",
  "images": [{ "path": "products/2427831/k3f9a1b2c3.webp", "alt": "Frasco de citrato de magnesio x 120" }],
  "price": 10990,
  "discount": { "type": "percent", "value": 10 },
  "finalPrice": 9891,
  "stock": 14,
  "reserved": 2,
  "inStock": true,
  "active": true,
  "published": true,
  "publishedAt": "<Timestamp>",
  "barcode": "7800000000009",
  "barcodeValid": true,
  "gtin": "7800000000009",
  "format": "capsulas",
  "unitsPerPack": 120,
  "family": "citrato-de-magnesio",
  "seo": null,
  "source": "controlfarma-xls",
  "importedAt": "<Timestamp>",
  "createdAt": "<Timestamp>",
  "updatedAt": "<Timestamp>"
}
```

Tipo TypeScript
```ts
type Sku = string;
type Clp = number; // entero

interface ProductDiscount { type: 'percent' | 'fixed'; value: number }
interface ProductImage { path: string; alt: string }

interface ProductDoc {
  sku: Sku;
  sourceName: string;
  name: string;
  slug: string | null;
  description: string | null;
  shortDescription: string | null;
  categoryId: string | null;
  images: ProductImage[];
  price: Clp;
  discount: ProductDiscount | null;
  finalPrice: Clp;
  stock: number;
  reserved: number;
  inStock: boolean;
  active: boolean;
  published: boolean;
  publishedAt: Timestamp | null;
  barcode: string | null;
  barcodeValid: boolean;
  gtin: string | null;
  format: string | null;
  unitsPerPack: number | null;
  family: string | null;
  seo: { title?: string; description?: string } | null;
  source: 'controlfarma-xls' | 'manual';
  importedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Escrituras directas del admin sobre `products` (regla `update` con `diff().affectedKeys().hasOnly([...])`): solo `name`, `description`, `shortDescription`, `categoryId`, `images`, `slug` (si no está publicado), `format`, `unitsPerPack`, `family`, `seo` y `updatedAt`. **Todo lo demás (precio, descuento, stock, publicación, activo) solo lo cambian las Functions.** Límite de las reglas: no pueden validar cada elemento de `images` (no hay bucles); validan tipo y tamaño (≤ 8), y el admin es de confianza. La Function de publicación sí revisa cada imagen.

---

### 2.2 `categories/{categoryId}`

ID = slug (`^[a-z0-9]+(-[a-z0-9]+)*$`, máx. 60). Inmutable.

| Campo | Tipo | Oblig. | Validación | Escribe |
|---|---|---|---|---|
| `slug` | string | sí | igual al ID | Admin directo, al crear |
| `name` | string | sí | 1–80 | Admin directo |
| `description` | string \| null | no | máx. 2000 | Admin directo |
| `imagePath` | string \| null | no | `categories/{slug}/{file}` en Storage | Admin directo |
| `order` | int | sí | 0–9999. Orden en menús | Admin directo |
| `published` | bool | sí | | Admin directo |
| `seo` | map \| null | no | `{title?, description?}` como en productos | Admin directo |
| `createdAt`, `updatedAt` | Timestamp | sí | `== request.time` al escribir | Admin directo |

Valores iniciales (D-023), sembrados por el script de arranque. Un producto pertenece a **una sola** categoría. La asignación sale del NOMBRE de la planilla y de la tabla de familias de `contracts/seo/00-palabras-clave-y-prioridades.md` (secciones 1 y 2); el admin la confirma al publicar.

| `slug` (ID) | `name` | `order` | Familias de la planilla |
|---|---|---|---|
| `vitaminas` | Vitaminas | 10 | Vitamina B12, B-Complex, C 1000 mg, D 800 UI, E 400 UI, Vit Total |
| `magnesio` | Magnesio | 20 | Citrato, triple quelado, cloruro y bisglicinato de magnesio |
| `minerales` | Minerales | 30 | Zinc, citrato de potasio |
| `omega-3` | Omega 3 | 40 | Omega 3, Omega 369 |
| `belleza` | Belleza | 50 | Colágeno 500 mg, Biotina |
| `bienestar` | Bienestar | 60 | Spirulina, melena de león, cúrcuma con pimienta, cranberry con vitaminas C y E, línea Ultra (Light, Relax, Lax) |

Nota SEO: si tras importar `minerales` queda con menos de 3 SKU publicados, el frontend aplica `noindex,follow` a esa categoría (lo decide el tech-lead tras la importación). Los textos de la línea Ultra, cranberry, melena de león y cúrcuma pasan por revisión de un profesional antes de publicarse (D-023).

Lectura pública solo si `published == true`. **No se borran** desde el cliente (despublicar). Con unas pocas categorías basta una lectura de la colección completa y se cachea con ISR.

```json
{ "slug": "magnesio", "name": "Magnesio", "description": "Citrato, bisglicinato y otras formas de magnesio en cápsulas.", "imagePath": null, "order": 20, "published": true, "seo": null, "createdAt": "<Timestamp>", "updatedAt": "<Timestamp>" }
```

Despublicar una categoría con productos publicados está permitido; la ficha del producto debe mostrar la categoría sin enlace (decisión: no bloquear al admin). Las categorías "proteínas" y "creatina" del borrador antiguo de SEO no existen en el catálogo real (D-023). El admin puede agregar categorías nuevas, pero las seis de arriba son las iniciales.

---

### 2.3 `orders/{orderNumber}`

ID = número legible `NE-000123` (D-007). El primer pedido es **`NE-000001`** (D-024; DispatchTrack acepta el formato). `NE-` + el entero con ceros a la izquierda hasta 6 dígitos (si pasa de 999999 simplemente crece). Se genera en la transacción de `createOrder` con `counters/orders`. Es el identificador que se da al cliente y que se usa en DispatchTrack.

| Campo | Tipo | Oblig. | Validación | Escribe |
|---|---|---|---|---|
| `orderNumber` | string | sí | `^NE-\d{6,}$`, igual al ID | `createOrder` |
| `number` | int | sí | el entero detrás del prefijo | `createOrder` |
| `paymentMethod` | `"flow"\|"transfer"` | sí | inmutable | `createOrder` |
| `paymentStatus` | `"pending_payment"\|"paid"\|"payment_review"\|"expired"\|"cancelled"\|"refunded"` | sí | ver sección 6. `refunded` es terminal y solo se alcanza desde `paid` | Servidor |
| `fulfillmentStatus` | `null\|"preparing"\|"ready_for_pickup"\|"on_route"\|"delivered"` | sí | `null` hasta que el pedido está `paid` | Servidor |
| `stockState` | `"reserved"\|"committed"\|"released"` | sí | si el stock del pedido está reservado, vendido o devuelto. Evita liberar o reponer dos veces. Un pedido `refunded` queda `committed` (sin reposición) o `released` (con `restock: true`) | Servidor |
| `reservedUntil` | Timestamp | sí | vencimiento de la reserva (D-006) | `createOrder` |
| `customer` | map | sí | `{firstName ≤60, lastName ≤60, email ≤254 (formato válido), phone (normalizado), rut}`. `rut` es **obligatorio**, con módulo 11 validado en el servidor y normalizado a `12345678-K` (sin puntos, con guion, K mayúscula; regex `^\d{7,8}-[0-9K]$`). Dato personal: nunca sale en `getOrderStatus` ni en logs (D-024) | `createOrder` |
| `delivery` | map | sí | `{type:"shipping", communeCode, communeName, address ≤200, notes? ≤300}` o `{type:"pickup", storeAddress, storeHours}` (snapshot de `settings/public`) | `createOrder` |
| `items` | array | sí | 1–20 elementos, ver abajo. Snapshot, no referencias vivas | `createOrder` |
| `subtotal` | int | sí | `Σ unitFinalPrice × qty` | `createOrder` |
| `shipping` | int | sí | 0 (retiro o envío gratis) o `shippingFee` | `createOrder` |
| `total` | int | sí | `subtotal + shipping`. **Es lo que se cobra** | `createOrder` |
| `currency` | `"CLP"` | sí | | `createOrder` |
| `freeShippingApplied` | bool | sí | informativo | `createOrder` |
| `accessTokenHash` | string | sí | SHA-256 hex del token de acceso (el token en claro se entrega una vez y no se guarda) | `createOrder` (y rotación en un reintento idempotente) |
| `flow` | map \| null | no | `{commerceOrder, token, flowOrder, paymentUrl, attempt, lastStatus, lastCheckedAt, paidAt, amountPaid}`; solo si `paymentMethod == "flow"` | `createFlowPayment`, `flowConfirm` |
| `transfer` | map \| null | no | `{confirmedBy (uid), confirmedAt, reference?, note?}` | `confirmTransferPayment` |
| `refund` | map \| null | no | Solo si `paymentStatus == "refunded"`: `{amount: int (1..total), method: "flow"\|"transfer", refundedAt: Timestamp (fecha del reembolso hecho a mano), note (1..300), restock: bool, restocked: bool (true si se repuso stock), recordedBy: uid, recordedAt: Timestamp}` | `recordManualRefund` |
| `review` | map \| null | no | `{reason, openedAt, resolvedBy?, resolvedAt?, resolution?: "accepted"\|"cancelled", note?}`; razones: `AMOUNT_MISMATCH`, `NO_STOCK_AFTER_EXPIRY`, `PAID_AFTER_CANCEL`, `CURRENCY_MISMATCH` | Servidor |
| `statusHistory` | array | sí | `{at, kind:"payment"\|"fulfillment"\|"stock", from, to, by:"system"\|"flow"\|<uid>, note?, reason?, direction?: "backward", refund?: {amount, method, restock}}`. `reason` es obligatorio al retroceder un estado logístico (6.2); en un reembolso, `note` y `refund` resumen el campo `refund`. Máx. 50 entradas | Servidor |
| `paidAt` | Timestamp \| null | no | | Servidor |
| `createdAt`, `updatedAt` | Timestamp | sí | | Servidor |

Elemento de `items` (snapshot):
```ts
interface OrderItem {
  sku: Sku;
  name: string;            // nombre para mostrar al momento de la compra
  unitPrice: Clp;          // precio de lista
  discount: ProductDiscount | null;
  unitFinalPrice: Clp;     // precio efectivo por unidad
  qty: number;             // 1..10
  lineTotal: Clp;          // unitFinalPrice * qty
}
```

Ejemplo (pago con Flow, despacho a domicilio, sin umbral de envío gratis configurado)
```json
{
  "orderNumber": "NE-000123",
  "number": 123,
  "paymentMethod": "flow",
  "paymentStatus": "paid",
  "fulfillmentStatus": "preparing",
  "stockState": "committed",
  "reservedUntil": "<Timestamp>",
  "customer": { "firstName": "Ana", "lastName": "Pérez", "email": "ana@example.com", "phone": "+56912345678", "rut": "12345678-5" },
  "delivery": { "type": "shipping", "communeCode": "puente-alto", "communeName": "Puente Alto", "address": "Calle Falsa 123, depto 4", "notes": "Dejar con conserje" },
  "items": [
    { "sku": "2427831", "name": "Citrato de Magnesio x 120 cápsulas", "unitPrice": 10990, "discount": { "type": "percent", "value": 10 }, "unitFinalPrice": 9891, "qty": 2, "lineTotal": 19782 },
    { "sku": "2427851", "name": "Vitamina C x 60 cápsulas", "unitPrice": 8990, "discount": null, "unitFinalPrice": 8990, "qty": 1, "lineTotal": 8990 }
  ],
  "subtotal": 28772,
  "shipping": 3990,
  "total": 32762,
  "currency": "CLP",
  "freeShippingApplied": false,
  "accessTokenHash": "<sha256 hex>",
  "flow": { "commerceOrder": "NE-000123", "token": "<token de Flow>", "flowOrder": 0, "paymentUrl": "<url de Flow>", "attempt": 1, "lastStatus": 2, "lastCheckedAt": "<Timestamp>", "paidAt": "<Timestamp>", "amountPaid": 32762 },
  "transfer": null,
  "review": null,
  "refund": null,
  "statusHistory": [
    { "at": "<Timestamp>", "kind": "payment", "from": null, "to": "pending_payment", "by": "system" },
    { "at": "<Timestamp>", "kind": "payment", "from": "pending_payment", "to": "paid", "by": "flow" },
    { "at": "<Timestamp>", "kind": "fulfillment", "from": null, "to": "preparing", "by": "system" }
  ],
  "paidAt": "<Timestamp>",
  "createdAt": "<Timestamp>",
  "updatedAt": "<Timestamp>"
}
```

Privacidad: el pedido contiene datos personales (incluido el RUT). **Ningún cliente público lo lee** (ni por ID). El público solo ve el estado por la Function `getOrderStatus` con número + token, que no devuelve RUT, correo, teléfono ni dirección. El RUT tampoco se escribe en logs. Retención de datos personales: PREGUNTA ABIERTA 7.

No hay factura: solo boleta manual en Control Farma, así que no se guardan razón social ni giro (D-024).

Datos de seguimiento: el admin ve el `orderNumber` y lo usa en DispatchTrack; no hay integración por API en el MVP.

---

### 2.4 `counters/orders`

| Campo | Tipo | Validación | Escribe |
|---|---|---|---|
| `last` | int | `>= 0`. Último número entregado | `createOrder`, dentro de la transacción |
| `updatedAt` | Timestamp | | Servidor |

Si el documento no existe, `createOrder` toma `settings/private.orderNumberStart - 1` como `last` (por defecto `orderNumberStart = 1`, así que el primer pedido es `NE-000001`). Si la transacción falla no se consume número. Puede haber saltos si se cancelan pedidos: es normal. Rendimiento: ~1 escritura/s sostenida por documento, sobrado para el negocio. Cliente: **sin acceso** ni de lectura.

```json
{ "last": 123, "updatedAt": "<Timestamp>" }
```

---

### 2.5 `settings/public` y `settings/private`

`settings/public` (lectura pública; escribe el admin directo con validación en reglas):

| Campo | Tipo | Oblig. | Validación |
|---|---|---|---|
| `shippingFee` | int | sí | 0–100.000. Por defecto **3990** |
| `freeShippingThreshold` | int \| null | sí | `null` = **no hay envío gratis** (valor inicial, D-datos confirmados). Si es entero: 1–10.000.000. Se compara con `>=` contra el subtotal con descuentos (ver 7.4) |
| `communes` | array de `{code, name}` | sí | lista de comunas con despacho. `code`: slug sin tildes. Se siembra con las **52 comunas de la Región Metropolitana** (ver 7.5). El servidor valida `communeCode` contra esta lista |
| `pickup` | map | sí | `{enabled: bool, address: string ≤200, hours: string ≤200}`. Valor inicial: Av. Concha y Toro 180, Puente Alto; lunes a viernes 9:00 a 20:00 (horario confirmado el 2026-10-14) |
| `maxQtyPerItem` | int | sí | 1–100, por defecto 10 |
| `updatedAt` | Timestamp | sí | `== request.time` |

`settings/private` (solo admin lee y escribe directo; el servidor la lee):

| Campo | Tipo | Oblig. | Validación |
|---|---|---|---|
| `reservationMinutes` | map `{flow: int, transfer: int}` | sí | `flow`: 5–240 (por defecto **30**). `transfer`: 60–10080 (por defecto **2880 = 48 h**). Pendiente de confirmar por el jefe (D-006, PREGUNTA ABIERTA 2); son valores configurables |
| `bank` | map | sí | `{bankName, accountType, accountNumber, holderName, holderRut, contactEmail?}` strings ≤100. **Datos de prueba hasta que Carlos entregue los reales.** No son secretos de acceso, pero se entregan solo al comprador con transferencia vía `getOrderStatus` |
| `orderNumberStart` | int | sí | ≥ 1, por defecto 1 (primer pedido `NE-000001`) |
| `limits` | map | sí | Límites anti-abuso, valores iniciales configurables (D-024): `{createOrderPerIpPer10Min: int 1..100 (5), pendingOrdersPerEmail: int 1..50 (3), orderStatusPerIpPer10Min: int 1..1000 (30), orderStatusFailuresPerOrder: int 1..100 (10)}`. Si falta un valor, la Function usa el inicial |
| `updatedAt` | Timestamp | sí | |

```json
// settings/public
{
  "shippingFee": 3990,
  "freeShippingThreshold": null,
  "communes": [{ "code": "puente-alto", "name": "Puente Alto" }, { "code": "santiago", "name": "Santiago" }],
  "pickup": { "enabled": true, "address": "Av. Concha y Toro 180, Puente Alto", "hours": "Lunes a viernes de 9:00 a 20:00" },
  "maxQtyPerItem": 10,
  "updatedAt": "<Timestamp>"
}
// settings/private
{
  "reservationMinutes": { "flow": 30, "transfer": 2880 },
  "bank": { "bankName": "BANCO DE PRUEBA", "accountType": "Cuenta corriente", "accountNumber": "000000000", "holderName": "Nutra Elements (prueba)", "holderRut": "11.111.111-1" },
  "orderNumberStart": 1,
  "limits": { "createOrderPerIpPer10Min": 5, "pendingOrdersPerEmail": 3, "orderStatusPerIpPer10Min": 30, "orderStatusFailuresPerOrder": 10 },
  "updatedAt": "<Timestamp>"
}
```

No hay otros documentos en `settings`: las reglas nombran `public` y `private` explícitamente. Los secretos (Flow, revalidación) **no** van aquí: ver functions.md, sección de variables.

---

### 2.6 `metrics` (D-012)

Agregados precalculados. Se actualizan con `FieldValue.increment` **en la misma transacción** en la que un pedido pasa a `paid` (así no se cuenta dos veces: la transacción solo corre si el estado cambia). Cuando un pedido pasa a `refunded` (`recordManualRefund`), **la misma transacción aplica una sola regla (D-025), igual para reembolsos totales y parciales**, con `increment` negativo o positivo sobre el día de su `paidAt` (el día que lo sumó): los ingresos bajan solo en `refund.amount`, el pedido sigue contando en `ordersCount` y las unidades (diarias y por SKU) se restan únicamente si `refund.restocked == true`. Cada pedido suma una sola vez y su reembolso se aplica una sola vez.

`metrics/daily/days/{YYYY-MM-DD}` (fecha de `paidAt` en `America/Santiago`)

| Campo | Tipo | Significado |
|---|---|---|
| `date` | string | `YYYY-MM-DD` |
| `ordersCount` | int | pedidos pagados ese día. **No baja con reembolsos** |
| `revenue` | int | ingresos **netos**: suma de `total` (incluye envío) menos `Σ refund.amount` de los reembolsos de pedidos de ese día |
| `merchandise` | int | suma de `subtotal`: mercadería **bruta**, antes de reembolsos (no baja con reembolsos) |
| `unitsSold` | int | unidades; baja solo por reembolsos con `refund.restocked == true` |
| `refundsCount` | int | cantidad de pedidos reembolsados cuyo `paidAt` cae ese día. Inicio 0. Solo servidor |
| `refundedAmount` | int | suma de `refund.amount` de esos reembolsos (CLP). Inicio 0. Solo servidor |
| `updatedAt` | Timestamp | |

`refundsCount` y `refundedAmount` se asocian al día de `paidAt` (no al de `refundedAt`), para que `revenue` neto de ese día sea coherente. Los documentos diarios anteriores a D-025 no tienen estos campos: el cliente debe leerlos con valor por defecto 0. El servidor los crea en 0 al primer `increment`.

`metrics/products/items/{sku}`

| Campo | Tipo | Significado |
|---|---|---|
| `sku` | string | |
| `name` | string | nombre al último pago (para mostrar sin leer `products`) |
| `unitsSold` | int | unidades vendidas acumuladas |
| `revenue` | int | suma de `lineTotal`; baja solo por reembolsos con `refund.restocked == true` |
| `updatedAt` | Timestamp | |

Consultas del panel
- Ticket promedio de un rango = `Σ revenue / Σ ordersCount` sobre los días del rango (a lo más 31 lecturas por mes). Es **neto** de reembolsos, porque `revenue` ya los descuenta y `ordersCount` no cambia. Si `Σ ordersCount == 0`, se muestra 0 o "—" (no dividir).
- Reembolsos del rango: `Σ refundsCount` y `Σ refundedAmount` (los mismos documentos diarios, sin lecturas extra).
- Más vendidos: `metrics/products/items` `orderBy("unitsSold","desc").limit(10)` (índice de un solo campo, automático).
- Sin stock: `products where stock == 0` (ver índices). Hasta 150 documentos.
- Reembolsos (D-025, una sola regla para totales y parciales), sobre el día de `paidAt` en `America/Santiago`: `revenue -= refund.amount`, `refundsCount += 1`, `refundedAmount += refund.amount`; `ordersCount` y `merchandise` **no cambian**; `unitsSold -= Σ qty` **solo si** `refund.restocked == true`. Por producto (`metrics/products/items/{sku}`): `unitsSold -= qty` y `revenue -= lineTotal` **solo si** `refund.restocked == true`; si no, no cambian. Se usa `restocked` (lo que realmente pasó), no `restock` (lo pedido). Consecuencia: `revenue` por SKU es mercadería, y puede no cuadrar con el `revenue` diario (que incluye envío y reembolsos sin reposición).

```json
// metrics/daily/days/2026-10-20
{ "date": "2026-10-20", "ordersCount": 7, "revenue": 254300, "merchandise": 227420, "unitsSold": 19, "refundsCount": 0, "refundedAmount": 0, "updatedAt": "<Timestamp>" }
// metrics/products/items/2427831
{ "sku": "2427831", "name": "Citrato de Magnesio x 120 cápsulas", "unitsSold": 41, "revenue": 405531, "updatedAt": "<Timestamp>" }
```

---

### 2.7 `imports/{importId}`

Reporte de cada importación u operación masiva del admin (D-018). Lectura solo admin; escribe el servidor. Se pagina por `createdAt desc`.

| Campo | Tipo | Notas |
|---|---|---|
| `kind` | `"catalog"\|"price"\|"stock"\|"discount"\|"publish"` | |
| `dryRun` | bool | si fue vista previa, no se guarda reporte salvo que el admin lo pida (ver functions.md); por defecto las vistas previas **no** crean documento |
| `fileName` | string \| null | informado por el cliente, solo para mostrar |
| `rows` | int | filas recibidas |
| `created`, `updated`, `unchanged`, `skipped` | int | contadores |
| `corrected` | array `{row, sku, field, from, to}` | correcciones: stock negativo → 0 en cualquier lote; vacío → 0 **solo** al crear productos en `importCatalog` (importación inicial, D-018, ver functions.md 5.1). Una celda vacía en `importStock` o en una fila ya existente es inválida (`EMPTY_STOCK`) |
| `invalid` | array `{row, sku?, code, message}` | filas rechazadas |
| `warnings` | array `{sku?, code, message}` | por ejemplo códigos 978/979, `DISCOUNT_REMOVED` (descuento fijo que quedó inválido por un precio nuevo), laboratorio distinto |
| `truncated` | bool | `true` si alguna lista pasó de 500 entradas (límite de 1 MiB por documento) |
| `createdBy` | string | uid del admin |
| `createdAt` | Timestamp | |

```json
{
  "kind": "catalog", "dryRun": false, "fileName": "productos_nutra_elements.xls", "rows": 33,
  "created": 33, "updated": 0, "unchanged": 0, "skipped": 0,
  "corrected": [
    { "row": 20, "sku": "2427900", "field": "stock", "from": -5, "to": 0 },
    { "row": 25, "sku": "2427911", "field": "stock", "from": null, "to": 0 }
  ],
  "invalid": [],
  "warnings": [{ "sku": "2427850", "code": "BARCODE_ISBN_RANGE", "message": "El código de barras empieza con 978; no se publicará como GTIN." }],
  "truncated": false, "createdBy": "<uid>", "createdAt": "<Timestamp>"
}
```

---

### 2.8 `paymentEvents/{flowToken}` (idempotencia de Flow)

ID = `token` que envía Flow a `urlConfirmation`. Solo servidor; el admin puede leer para auditar.

| Campo | Tipo | Notas |
|---|---|---|
| `token` | string | |
| `orderNumber` | string | resuelto con `commerceOrder` de `getStatus` |
| `flowOrder` | int | |
| `flowStatus` | int | último estado informado por `getStatus` (1 pendiente, 2 pagada, 3 rechazada, 4 anulada; **verificar en la documentación de Flow**) |
| `amount` | int | monto informado por Flow |
| `outcome` | `"paid"\|"payment_review"\|"pending"\|"rejected"\|"duplicate"\|"ignored"` | resultado aplicado |
| `receivedCount` | int | cuántas veces llegó la confirmación (`increment`) |
| `firstReceivedAt`, `lastReceivedAt` | Timestamp | |

La idempotencia se apoya en **dos** cosas dentro de la misma transacción: este documento y el `paymentStatus` del pedido. Ver functions.md.

---

### 2.9 `idempotencyKeys` y `rateLimits` (solo servidor)

`idempotencyKeys/{sha256 hex de clientRequestId}`: `{orderNumber, createdAt, expiresAt}`. `expiresAt` = +7 días, con **política TTL** sobre `expiresAt`.
`rateLimits/{sha256 hex de "<función>:<ip>"}`: `{count, windowStart, expiresAt}`. TTL sobre `expiresAt` (+1 día). No guardan datos personales en claro (la IP va con hash).
Cliente: **sin acceso**. Costo: una lectura y una escritura por llamada a las Functions públicas; irrelevante al volumen esperado.

---

## 3. Matriz de acceso de las reglas

Por defecto **todo denegado**. "Servidor" = Admin SDK (no pasa por reglas, por eso las reglas niegan al cliente). Las reglas leen el claim con `request.auth.token.admin == true` (sin `get()`, para no pagar lecturas extra).

| Ruta | Lectura público | Lectura admin | Crear | Actualizar | Borrar |
|---|---|---|---|---|---|
| `products/{sku}` | **sí, solo** si `published == true && active == true` (consulta debe incluir ambos filtros) | sí, todos | servidor | admin directo solo los campos de contenido listados en 2.1; el resto, servidor | nadie desde cliente |
| `categories/{id}` | sí, solo `published == true` | sí | admin (con validación) | admin (con validación; `slug` inmutable) | nadie desde cliente |
| `orders/{id}` | **no** | sí (`get` y `list`) | servidor | servidor | nadie |
| `counters/{id}` | **no** | **no** | servidor | servidor | nadie |
| `settings/public` | sí | sí | admin | admin (con validación) | nadie |
| `settings/private` | **no** | sí | admin | admin (con validación) | nadie |
| `metrics/**` | **no** | sí | servidor | servidor | nadie |
| `imports/{id}` | **no** | sí | servidor | servidor | nadie |
| `paymentEvents/{id}` | **no** | sí | servidor | servidor | nadie |
| `idempotencyKeys/**`, `rateLimits/**` | **no** | **no** | servidor | servidor | nadie |
| cualquier otra ruta | **no** | **no** | **no** | **no** | **no** |

Reglas que el contrato exige (cada una con su test, sección 9)
1. El cliente público **nunca** escribe en `orders`, `counters`, `products`, `metrics`, `imports`, `paymentEvents`.
2. Un usuario autenticado **sin** claim `admin` equivale a un público (no hay cuentas de cliente; si alguien se registra en Auth, no obtiene nada).
3. Admin no puede escribir `price`, `discount`, `finalPrice`, `stock`, `reserved`, `inStock`, `active`, `published` ni `sku` en `products`.
4. `slug` de un producto publicado no cambia por escritura directa.
5. `updatedAt`/`createdAt` deben ser `request.time`.
6. Los tipos y rangos de las tablas de arriba se validan en las reglas para lo que el admin escribe directo (`products` contenido, `categories`, `settings`).
7. `list` de `orders` para admin: sin límites en reglas, pero el cliente **debe paginar** (`limit(25)` + `startAfter`).
8. Login del admin con **correo y contraseña** (D-024). Auto-registro **desactivado** en Authentication (por verificar si la opción está disponible sin Identity Platform; la seguridad no depende de ello: sin claim `admin` una cuenta no obtiene nada, regla 2). Los administradores se crean desde la consola y reciben el claim con el script inicial o con `grantAdmin`. **MFA queda para después del lanzamiento.**
9. `orders.refund`, `orders.statusHistory` y `paymentStatus == "refunded"` solo los escribe el servidor.

---

## 4. Storage

Bucket por defecto del proyecto, ubicación `us-east4` (D-010). **En dev (Spark) solo existe en el Storage Emulator** (D-021).

| Ruta | Lectura | Escritura / borrado | Tipos | Tamaño máx. |
|---|---|---|---|---|
| `products/{sku}/{file}` | pública | solo admin (claim) | `image/jpeg`, `image/png`, `image/webp` | **2 MiB** (D-024) |
| `categories/{slug}/{file}` | pública | solo admin | igual | 2 MiB |
| cualquier otra ruta | denegada | denegada | — | — |

- `{file}`: `^[A-Za-z0-9_-]{8,40}\.(jpg|jpeg|png|webp)$`. El nombre lleva un identificador aleatorio **nuevo en cada subida**, así el archivo es inmutable y se sirve con `Cache-Control: public, max-age=31536000, immutable` (el admin lo fija al subir).
- SVG no se permite (riesgo de scripts). Las reglas verifican `request.resource.contentType` y `request.resource.size`; no inspeccionan el contenido real.
- Quién escribe: el admin, **desde el navegador** con el SDK, tras **comprimir en el navegador a WebP con el lado largo ≤ 1600 px** (D-024); las reglas exigen además el límite de 2 MiB. Después actualiza `products/{sku}.images` (escritura directa permitida). Quitar una imagen del array debe borrar también el archivo; si queda huérfano no afecta a nadie.
- Las Functions no manejan los archivos de imágenes. Las planillas Excel **no se suben a Storage**: el navegador las lee y envía las filas a las Functions (ver functions.md).
- URL pública: la construye el frontend a partir de `path` (formato de descarga del SDK o `getDownloadURL`). `next/image` necesita el host del bucket en `remotePatterns`.

---

## 5. Índices compuestos

Los índices de un solo campo son automáticos. El estado `refunded` no necesita índices nuevos: `paymentStatus ASC, createdAt DESC` ya sirve para filtrar reembolsados. Estos son los compuestos que exige el contrato; van en `firestore.indexes.json` (los crea firebase-architect en 2B.2; el emulador no los exige, la nube sí).

| Colección | Campos | Consulta que sirve |
|---|---|---|
| `products` | `published ASC, active ASC, name ASC` | catálogo público completo (/productos) |
| `products` | `published ASC, active ASC, categoryId ASC, name ASC` | /categorias/[slug] |
| `products` | `published ASC, active ASC, family ASC, unitsPerPack ASC` | tamaños de un mismo producto |
| `products` | `published ASC, stock ASC` | admin: publicados sin stock (`stock == 0`) |
| `products` | `stock ASC, name ASC` | admin: todos sin stock (`stock == 0`) |
| `orders` | `paymentStatus ASC, reservedUntil ASC` | job de reservas vencidas |
| `orders` | `paymentStatus ASC, createdAt DESC` | admin: pedidos por estado de pago |
| `orders` | `fulfillmentStatus ASC, createdAt DESC` | admin: pedidos por estado logístico |
| `orders` | `paymentMethod ASC, paymentStatus ASC, createdAt DESC` | admin: transferencias por confirmar |

Sin índice compuesto: listar `orders orderBy createdAt desc`, `imports orderBy createdAt desc`, `slug == X`, `metrics/products/items orderBy unitsSold desc`.
Política TTL (campo `expiresAt`) sobre `idempotencyKeys` y `rateLimits`: se declara como `fieldOverrides` con `ttl: true` en `firestore.indexes.json` (sintaxis por verificar al implementar).

```json
{
  "indexes": [
    { "collectionGroup": "products", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "published", "order": "ASCENDING" }, { "fieldPath": "active", "order": "ASCENDING" }, { "fieldPath": "name", "order": "ASCENDING" } ] },
    { "collectionGroup": "products", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "published", "order": "ASCENDING" }, { "fieldPath": "active", "order": "ASCENDING" }, { "fieldPath": "categoryId", "order": "ASCENDING" }, { "fieldPath": "name", "order": "ASCENDING" } ] },
    { "collectionGroup": "products", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "published", "order": "ASCENDING" }, { "fieldPath": "active", "order": "ASCENDING" }, { "fieldPath": "family", "order": "ASCENDING" }, { "fieldPath": "unitsPerPack", "order": "ASCENDING" } ] },
    { "collectionGroup": "products", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "published", "order": "ASCENDING" }, { "fieldPath": "stock", "order": "ASCENDING" } ] },
    { "collectionGroup": "products", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "stock", "order": "ASCENDING" }, { "fieldPath": "name", "order": "ASCENDING" } ] },
    { "collectionGroup": "orders", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "paymentStatus", "order": "ASCENDING" }, { "fieldPath": "reservedUntil", "order": "ASCENDING" } ] },
    { "collectionGroup": "orders", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "paymentStatus", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "orders", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "fulfillmentStatus", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "orders", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "paymentMethod", "order": "ASCENDING" }, { "fieldPath": "paymentStatus", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] }
  ],
  "fieldOverrides": []
}
```

---

## 6. Máquina de estados del pedido

Dos ejes independientes: **estado de pago** (`paymentStatus`) y **estado logístico** (`fulfillmentStatus`). El logístico solo existe mientras el pago es `paid` (en un pedido `refunded` queda congelado en su último valor).

Etiquetas para mostrar (el campo guarda el código)

| Código | Etiqueta |
|---|---|
| `pending_payment` | Pago pendiente |
| `paid` | Pagado |
| `payment_review` | Pago en revisión |
| `expired` | Expirado |
| `cancelled` | Cancelado |
| `refunded` | Reembolsado |
| `preparing` | En preparación |
| `ready_for_pickup` | Listo para retirar |
| `on_route` | En ruta |
| `delivered` | Entregado |

### 6.1 Estados de pago

| Desde | Hacia | Quién lo ejecuta | Condición | Stock |
|---|---|---|---|---|
| (nuevo) | `pending_payment` | `createOrder` (invitado, vía Function) | stock suficiente | Se **reserva** (`stock -= qty`, `reserved += qty`, `stockState = reserved`) |
| `pending_payment` | `paid` | `flowConfirm` (Flow) o `confirmTransferPayment` (admin) | Flow: `getStatus` pagado, monto y moneda correctos. Transferencia: el admin verificó el depósito | Se **confirma** la venta: `reserved -= qty`, `stockState = committed`. `stock` no cambia (ya estaba descontado) |
| `pending_payment` | `expired` | `releaseExpiredReservations` (sistema) | `reservedUntil <= now` y, si hay `flow.token`, `getStatus` no está pagado | Se **libera**: `stock += qty`, `reserved -= qty`, `stockState = released` |
| `pending_payment` | `cancelled` | `cancelOrder` (admin) | | Se **libera** |
| `expired` | `paid` | `flowConfirm` (pago tardío) o `confirmTransferPayment` (admin) | hay stock para **todos** los ítems: se re-reserva y se confirma en la misma transacción | `stock -= qty` y queda `committed` |
| `expired` | `payment_review` | los mismos | **no** hay stock suficiente (`review.reason = NO_STOCK_AFTER_EXPIRY`) | Sin cambios (sigue `released`) |
| `cancelled` | `payment_review` | `flowConfirm` | llegó un pago de Flow a un pedido cancelado (`PAID_AFTER_CANCEL`) | Sin cambios (`released`) |
| `pending_payment` | `payment_review` | `flowConfirm` | monto o moneda distintos al `total` del snapshot (`AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`) | La reserva **se mantiene** (`reserved`) hasta que el admin resuelva; el job **no** libera pedidos en revisión |
| `payment_review` | `paid` | `resolvePaymentReview` (admin, `accept`) | hay stock (o la reserva sigue); se re-reserva si estaba `released` | Se confirma |
| `payment_review` | `cancelled` | `resolvePaymentReview` (admin, `cancel`) | el admin ya hizo el reembolso a mano en Flow o decidió no honrar el pedido | Si estaba `reserved`, se **libera** |
| `paid` | `refunded` | `recordManualRefund` (admin) | El reembolso ya se hizo a mano, fuera del sistema (Flow o transferencia). Exige monto, medio, fecha, nota y `restock` | Solo si `restock == true` y `stockState == committed`: `stock += qty`, `inStock` recalculado, `stockState = released`, en la misma transacción. Con `restock == false` no cambia. Nunca se repone dos veces |
| `paid` | (otro) | — | Un pedido pagado **no se cancela**: se reembolsa. Cualquier otra transición desde `paid` es `INVALID_TRANSITION` | Nunca se libera solo |

Estados terminales: `cancelled` y `refunded`. `paid` solo tiene como salida de pago `refunded` (su avance normal es logístico). `expired` es "terminal salvo pago tardío".

Matriz de transiciones de pago (fila = desde, columna = hacia; `sí` permitida, `no` prohibida y devuelve `INVALID_TRANSITION`):

| Desde \ Hacia | pending_payment | paid | payment_review | expired | cancelled | refunded |
|---|---|---|---|---|---|---|
| (nuevo) | sí | no | no | no | no | no |
| pending_payment | no | sí | sí | sí | sí | no |
| paid | no | no | no | no | no | sí |
| payment_review | no | sí | no | no | sí | no |
| expired | no | sí | sí | no | no | no |
| cancelled | no | no | sí | no | no | no |
| refunded | no | no | no | no | no | no |

Cuándo se libera el stock (resumen): (1) `pending_payment → expired`; (2) `pending_payment → cancelled`; (3) `payment_review → cancelled` si estaba reservado. Se **repone** stock de un pedido ya vendido solo en `paid → refunded` con `restock: true` (`committed → released`). En todos los casos solo si `stockState == "reserved"` dentro de la transacción: así **nunca se repone dos veces**. Un pago rechazado por Flow no libera: el cliente puede reintentar mientras dure la reserva.

### 6.2 Estados logísticos

Se fijan en `preparing` automáticamente cuando el pedido pasa a `paid` (por el sistema o por el admin que confirmó). Avanzan hacia adelante y, solo por corrección del admin, pueden retroceder **un paso** (D-024).

| Desde | Hacia | Quién | Condición |
|---|---|---|---|
| `null` | `preparing` | sistema, al pasar a `paid` | |
| `preparing` | `ready_for_pickup` | admin (`updateFulfillment`) | `delivery.type == "pickup"` |
| `preparing` | `on_route` | admin | `delivery.type == "shipping"` |
| `ready_for_pickup` | `delivered` | admin | |
| `on_route` | `delivered` | admin | |
| `delivered` | `ready_for_pickup` | **solo admin** (`updateFulfillment`) | `delivery.type == "pickup"`. Retroceso de un paso; `reason` obligatorio |
| `delivered` | `on_route` | solo admin | `delivery.type == "shipping"`. Retroceso de un paso; `reason` obligatorio |
| `ready_for_pickup` | `preparing` | solo admin | Retroceso de un paso; `reason` obligatorio |
| `on_route` | `preparing` | solo admin | Retroceso de un paso; `reason` obligatorio |

Retroceder está permitido **solo al admin y de a un paso**, con un motivo (`reason`, 1..300) obligatorio que queda en `statusHistory` con `direction: "backward"`. Retroceder dos o más pasos, o hacia `null`, es `INVALID_TRANSITION`. Pasar al mismo estado en que ya está es una operación válida y no hace nada (idempotente). No hay correos (D-008): el cambio solo se refleja en `getOrderStatus` y en el admin.

```
pending_payment --paid--> paid --> [preparing -> ready_for_pickup | on_route -> delivered]
      |  \--expired--> expired --pago tardío--> paid | payment_review
      |  \--cancelled--> cancelled --pago tardío--> payment_review
      \--monto distinto--> payment_review --admin--> paid | cancelled
paid --recordManualRefund (admin, reembolso hecho a mano)--> refunded   (terminal; repone stock solo si restock == true)
```

---

## 7. Reglas de negocio de dinero y envío

### 7.1 Dinero
CLP entero en todos los campos de dinero. Cualquier `number` con decimales se rechaza. Límites de cordura: precio de lista 1–10.000.000; total de un pedido ≤ 50.000.000 (error `ORDER_TOO_LARGE` si no). Un total de 0 no se acepta (`ZERO_TOTAL`): Flow no cobra 0 y una transferencia de 0 no tiene sentido.

### 7.2 Quién calcula
Solo el servidor (D-005). El cliente envía `[{sku, qty}]`. `createOrder` lee los productos y calcula todo con `finalPrice` ya almacenado **recalculado** desde `price` y `discount` (no confía en el valor guardado sin recomputarlo: una función pura `computeFinalPrice` única, usada también al escribir).

### 7.3 Descuento por producto
Un producto tiene como máximo **un** descuento (`discount`): porcentaje o monto fijo. Aplicar uno nuevo **reemplaza** al anterior (no se acumulan). Sin fechas de vigencia en el MVP (D-024: las ofertas con fechas no entran en el MVP).

```
percent: finalPrice = floor((price * (100 - value) + 50) / 100)     // redondeo al entero más cercano, mitades hacia arriba
fixed:   finalPrice = price - value
siempre: finalPrice = max(0, min(price, finalPrice))                 // nunca baja de 0 ni sube de price
```
Ejemplos: `price 12990, percent 10` → `floor((12990*90+50)/100)` = 11691. `price 9990, percent 15` → 8491,5 → **8492**. `price 5990, fixed 1000` → 4990.
Validaciones al escribir: `percent` entero 1–99; `fixed` entero 1 a `price-1` (así `finalPrice >= 1`). Un descuento que daría 0 se rechaza como fila inválida. Si un cambio de precio (Excel o manual) deja inválido un descuento fijo existente (`value >= newPrice`), el servidor **elimina el descuento** (única excepción a "la reimportación nunca toca los descuentos", D-024) y lo informa como advertencia `DISCOUNT_REMOVED` en el reporte. No se redondea a múltiplos de 10.

### 7.4 Envío
- Despacho: `shippingFee` (por defecto **3990**) a **todas** las comunas de la lista.
- Retiro en tienda: **0**.
- Envío gratis: solo si `freeShippingThreshold` no es `null` y `subtotal >= freeShippingThreshold`. Con `null` **no hay envío gratis** (valor inicial). Si es retiro, ya es 0 (no se marca `freeShippingApplied`).
- **El descuento se combina con el envío gratis**: el umbral se compara con el `subtotal` **ya con descuentos** (`Σ unitFinalPrice × qty`), nunca con el precio de lista. Confirmado en D-024: se combina con descuentos y la comparación es con `>=` (un subtotal igual al umbral ya tiene envío gratis).
- `total = subtotal + shipping`.

### 7.5 Comunas
Lista en `settings/public.communes` (única fuente de verdad, editable por el admin; la usan el selector del checkout y la validación del servidor). Valor inicial: las 52 comunas de la Región Metropolitana, con `code` = slug sin tildes ni eñes (`nunoa`, `maipu`, `penalolen`):
Santiago, Cerrillos, Cerro Navia, Conchalí, El Bosque, Estación Central, Huechuraba, Independencia, La Cisterna, La Florida, La Granja, La Pintana, La Reina, Las Condes, Lo Barnechea, Lo Espejo, Lo Prado, Macul, Maipú, Ñuñoa, Pedro Aguirre Cerda, Peñalolén, Providencia, Pudahuel, Quilicura, Quinta Normal, Recoleta, Renca, San Joaquín, San Miguel, San Ramón, Vitacura, Puente Alto, Pirque, San José de Maipo, Colina, Lampa, Til Til, San Bernardo, Buin, Calera de Tango, Paine, Melipilla, Alhué, Curacaví, María Pinto, San Pedro, Talagante, El Monte, Isla de Maipo, Padre Hurtado, Peñaflor.
Un `communeCode` fuera de la lista se rechaza con `INVALID_COMMUNE`.

---

## 8. Lecturas del frontend y costos

- Páginas públicas (D-022): ISR leyendo con **Admin SDK en el servidor de Next.js** (no con listeners del cliente). El stock y el precio mostrados pueden retrasarse unos segundos; se revalidan cuando el trigger de `products` llama a la ruta de revalidación (functions.md). Lo cobrado siempre lo recalcula `createOrder`.
- **Sin listeners en tiempo real** en el sitio público. En el admin: paginar de 25 en 25 con `get`; como máximo **un** `onSnapshot` (pedidos pendientes, `limit(25)`). El listado de productos del admin (≤150 documentos) se carga con `get` y se cachea en cliente.
- Alerta de costo: cada visita de un bot a una página dinámica que lea Firestore suma lecturas; por eso el catálogo es ISR. Las reglas con `get()`/`exists()` cuentan como lecturas: solo se usa `exists()` al cambiar `categoryId`.
- Riesgo de abuso: reservar stock con pedidos falsos. Mitigaciones en `createOrder`: App Check, límite por IP (`rateLimits`), cantidades máximas y expiración de la reserva (functions.md).

---

## 9. Qué se prueba con el Emulator Suite (tests de reglas)

Cada regla de la matriz tiene al menos un test positivo y uno negativo. Lista mínima:
- Público: lee producto publicado y activo; **no** lee uno sin publicar, ni una consulta sin los filtros; no lee `orders`, `counters`, `settings/private`, `metrics`, `imports`, `paymentEvents`, `idempotencyKeys`, `rateLimits`; no escribe nada.
- Autenticado sin claim: igual que público.
- Admin: lee todo lo que la matriz indica; actualiza contenido de un producto; **falla** al escribir `price`, `stock`, `discount`, `finalPrice`, `published`; falla al cambiar `slug` de uno publicado; no crea ni borra productos; no escribe `orders`/`counters`/`metrics`; valida tipos y rangos de `categories` y `settings`; `updatedAt` distinto de `request.time` falla.
- Admin no puede escribir `refund`, `statusHistory` ni `paymentStatus` en `orders`.
- Ruta no declarada: denegada.
- Storage: público lee imagen de producto; solo admin sube; rechaza `image/svg+xml`, 2 MiB + 1 byte (2 MiB exactos pasa) y nombres fuera del patrón; rutas no declaradas denegadas.
Los tests de concurrencia de stock, manipulación de precio e idempotencia de Flow están en functions.md (sección 8).

---

## 10. PREGUNTAS ABIERTAS

2. **Reservas configurables, pendientes del jefe.** Reserva de 30 min para Flow y de 48 h para transferencias (D-006). Mientras tanto son valores de `settings/private.reservationMinutes`.
7. **Retención de datos personales de los pedidos** (cuánto tiempo y cómo se borran; incluye el RUT). Después del lanzamiento, con revisión legal (Ley 21.719).

## 11. Resueltas (referencia: D-024, salvo indicación)

| # | Tema | Resolución |
|---|---|---|
| 1 | Categorías | Las seis de D-023: `vitaminas`, `magnesio`, `minerales`, `omega-3`, `belleza`, `bienestar` (2.2). Ejemplo de 2.1 corregido |
| 3 | Número inicial | `NE-000001`; DispatchTrack acepta el formato |
| 4 | Días de retiro | Lunes a viernes, 9:00 a 20:00 (datos de negocio confirmados el 2026-10-14) |
| 5 | Pedido pagado que se reembolsa | Estado terminal `refunded`, registrado con `recordManualRefund`; reposición de stock opcional; las métricas se ajustan según D-025 (ingresos menos `refund.amount`; unidades solo si se repuso stock; 2.6) |
| 6 | RUT | Obligatorio en `customer.rut`, módulo 11 en el servidor, normalizado a `12345678-K`, no expuesto. Sin factura (2.3) |
| 8 | Imágenes | Máx. 2 MiB, WebP comprimido en el navegador, lado largo ≤ 1600 px (4) |
| 9 | Retroceder estado logístico | Sí, solo admin, de a un paso y con motivo obligatorio en `statusHistory` (6.2) |
| 10 | Ofertas con fechas | No en el MVP (7.3) |
| 11 | Envío gratis | Se combina con descuentos; `subtotal con descuentos >= umbral` (7.4) |
| 12 | Login del admin | Correo y contraseña, auto-registro desactivado, MFA después del lanzamiento (3, regla 8) |
| 13 | Reimportar la planilla | Pisa precio y stock; nunca toca contenido ni descuentos (salvo `DISCOUNT_REMOVED`); ver functions.md 5.1 |
| — | Excel de stock con celda vacía | Fila inválida `EMPTY_STOCK`, no 0. La importación inicial de la planilla sigue D-018 (vacío o negativo → 0 y se reporta) |
| — | Límites anti-abuso | 5 pedidos / 10 min por IP y 3 pendientes por correo, más los de `getOrderStatus`, como valores iniciales configurables en `settings/private.limits` (2.5) |
