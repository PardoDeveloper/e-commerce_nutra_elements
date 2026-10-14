# Handoff firebase-architect: recomendación de datos y arquitectura (tarea 1.3)

Fecha: 2026-10-14. Solo recomendación: no se escribió código ni configuración, y no se creó ni habilitó nada.

## 0. Hechos verificados con la CLI (solo lectura) y lo que NO pude verificar

Verificado:
- `firebase-tools` 15.34.0 local. No hay `firebase.json` ni `.firebaserc` en el repo.
- Proyectos visibles: `nutraelements` y `farmaciaestrella-620f7` (este último no se tocó). "Resource Location ID" de `nutraelements` aparece como **[Not specified]**: no hay región por defecto de Google Cloud fijada.
- `apphosting:backends:list --project nutraelements` falla: el proyecto **no está en Blaze** y la API de App Hosting no se puede habilitar hasta subir de plan.
- `firestore:databases:list` falla con 403: la API de Firestore **no está habilitada**. No hay base de datos creada.
- Tabla de precios de Functions dentro de firebase-tools 15.34.0 (`deploy/functions/pricing.js`): `southamerica-west1` figura en tier 2, o sea que Functions la soporta.
- Data Connect (`init/features/dataconnect`) ofrece `southamerica-west1` y `southamerica-east1`.

NO verificado (decláralo así en cualquier decisión):
- Lista de regiones de App Hosting. La CLI solo la devuelve (`listLocations`) cuando el proyecto está en Blaze; el listado de la CLI que vi en `frameworks/constants.js` es del Hosting "web frameworks" antiguo, no de App Hosting. Mi memoria dice que App Hosting no cubre todas las regiones de Functions, pero no lo puedo confirmar. Hay que confirmarlo con la documentación oficial o con la CLI tras el paso a Blaze.
- Precios exactos de Cloud SQL, Firestore y de la prueba gratuita de Data Connect en Santiago. Los números de abajo son órdenes de magnitud de memoria, no cotizaciones.
- Cuotas de la capa gratuita de Resend y de Cloud Scheduler: verificar en sus páginas oficiales antes de contar con ellas.

## 1. Recomendación (una sola opción)

**Firestore (modo Native) para productos, pedidos, stock, contadores y métricas precalculadas. Toda la lógica de dinero y stock en Cloud Functions (2ª gen, TypeScript). Correos con Resend llamado desde una Function. Región de datos y Functions: `southamerica-west1` (sujeto a la confirmación de App Hosting, ver punto 5).**

### 1.1 Firestore vs Data Connect

| Criterio | Firestore | Data Connect (Cloud SQL Postgres) |
|---|---|---|
| Costo fijo | $0 fijo; con 70-150 productos y tráfico de una PYME queda dentro de la capa gratuita o en centavos. Total proyectado: ~$0-5/mes (Functions, Secret Manager, App Hosting/Cloud Build y Storage incluidos; ver riesgos). | Requiere una instancia de Cloud SQL siempre encendida. Mínimo aproximado (memoria, a verificar): ~$10-15/mes por la instancia más pequeña compartida, más disco y backups. Eso consume 50-75% del presupuesto de 20 USD antes de contar App Hosting y Functions. Creo que hay prueba gratuita de Cloud SQL de unos 3 meses para Data Connect, **no verificado**; al terminar, el costo fijo aparece de golpe. |
| Consistencia de stock | Transacciones por documento (`runTransaction`) con lectura y escritura atómicas; suficiente para una bodega y volumen bajo. | Mejor (SQL, `UPDATE ... WHERE stock >= n`), pero para este volumen no aporta una ventaja real. |
| Reglas de seguridad | Reglas de Firestore + claims de Auth; probadas con Emulator Suite. Estándar del equipo. | Autorización por directivas `@auth` en GraphQL; el equipo tiene menos práctica y no hay emulador de reglas equivalente de igual madurez (a verificar). |
| Métricas | Agregados precalculados (ver 1.4); consultas ad hoc son lentas de escribir y caras. | `GROUP BY` directo: muy cómodo. Es su mayor ventaja. |
| Plazo de 1 semana | Menor complejidad: SDK conocido, emuladores, tiempo real, sin esquema ni migraciones. | Mayor: diseñar esquema, conectores GraphQL, migraciones, aprovisionar Cloud SQL, conexión desde Functions y SSR. Riesgo real para la fecha. |
| Migración futura | Se puede migrar a Postgres si el negocio crece (ERP, reportes pesados, multi-bodega). El modelo con SKU y snapshot de pedido facilita exportar. Costo: un ETL. | Ya relacional, pero se paga el costo fijo desde el día 1. |

Porqué Firestore: el presupuesto y el plazo mandan; el volumen (≤150 SKU, una bodega) no justifica una base relacional. Si más adelante hay reportes pesados, multi-bodega o integración con Control Farma, se reevalúa (criterio de cambio: >~1.000 pedidos/mes con reportes complejos, o necesidad de joins reales).

### 1.2 Consistencia del stock y pedidos por transferencia

Recomendación: **reservar al crear el pedido** (descuento transaccional del stock disponible) en lugar de descontar solo al confirmar el pago.
- Por qué: si se descuenta recién al confirmar, dos clientes pueden pagar el último producto y hay que reembolsar uno (peor experiencia y trabajo manual en Flow). Con reserva, quien no encuentra stock se entera antes de pagar.
- Flow: la reserva dura 30 min (configurable). Si Flow no confirma, una función programada libera el stock y marca el pedido `expired`. Si el pago llega después de expirar, la confirmación intenta re-reservar; si no hay stock, el pedido pasa a `payment_review` para reembolso manual y se avisa al admin.
- Transferencia: reserva por X horas (propuesta: 48 h, configurable en `settings`). El admin confirma el pago a mano; si vence, se libera automáticamente. Esto evita que un pedido sin pagar bloquee stock indefinidamente.
- Alternativa descartada: no reservar nunca (descontar solo al confirmar). Más simple, pero permite sobreventa en transferencias, que son confirmadas por una persona horas después. Es la pregunta 1 para Carlos.
- Implementación: una transacción de Firestore que lee todos los `products/{sku}` del carrito, valida `stock >= qty` y escribe `stock - qty` y el pedido a la vez. Idempotente por `orderId`. Un carrito típico tiene pocos ítems (límite 500 escrituras por transacción no es un problema). Cancelar o expirar repone el stock en otra transacción protegida por el estado del pedido (no repone dos veces).

### 1.3 Reglas de seguridad (principios; no hay reglas escritas aún)

- Denegar todo por defecto.
- `products` (publicados) y `posts` (publicados): lectura pública; escritura solo admin (claim `admin: true`) y con validación de campos/tipos. El stock y el precio solo se modifican por Functions o por admin.
- `orders`: **ningún cliente crea ni modifica pedidos**. Se crean solo por Function callable (con App Check). Lectura: dueño por `uid` y admin. Invitados: seguimiento por una callable `trackOrder(orderNumber, email)` con límite de intentos, no por lectura directa.
- `users/{uid}`: el usuario lee/edita su perfil con lista blanca de campos (nunca `role`/claims). Admin lee.
- `counters`, `metrics`, `settings` (parte privada): solo servidor y admin (lectura). `settings` públicos (monto de envío gratis, tarifa) en un doc aparte `settings/public`, lectura pública.
- Admin = custom claim `admin: true`, asignado con un script/Function protegida (el primer admin se siembra a mano). Un solo rol, como pide el negocio.
- Storage: imágenes de producto/blog lectura pública, escritura solo admin con validación de tipo (`image/*`) y tamaño máximo.
- Todo con test en Emulator Suite (pedido).

### 1.4 Métricas sin Google Analytics

Agregados precalculados, no consultas sobre todos los pedidos:
- `metrics/daily/days/{YYYY-MM-DD}`: `ordersCount`, `revenue`, y `ticketAvg` derivado.
- `metrics/productSales/items/{sku}`: `unitsSold`, `revenue` (más por día si se quieren rangos).
- Se actualizan con `FieldValue.increment` dentro de la transacción de confirmación de pago (o en un trigger `onDocumentUpdated` sobre el cambio a `paid`, idempotente por estado). Ticket promedio = revenue / ordersCount.
- "Sin stock": consulta `products where stock == 0` (≤150 docs): barata, sin agregado.
- Más vendidos: consulta `orderBy unitsSold desc limit 10` sobre `productSales`.
- Costo: el panel lee decenas de documentos, no miles. Una consulta sobre todos los pedidos crecería sin límite; descartada.

### 1.5 Complejidad y migración
Firestore es la opción que cabe en la semana. Para migrar luego: mantener `sku` y `orderNumber` como claves naturales estables, pedidos con snapshot completo (no referencias a precios vivos), y exportación con Firestore export → BigQuery / script a Postgres.

## 2. Número de pedido legible (NE-000123)

- Documento `counters/orders` con `{ next: <entero> }`.
- Se incrementa **dentro de la misma transacción** que crea el pedido (la reserva de stock del punto 1.2): `n = next + 1`; `orderNumber = "NE-" + String(n).padStart(6,"0")`. El `orderId` del documento puede ser el propio `NE-000123` (único por construcción, y fácil de buscar).
- Concurrencia: Firestore reintenta transacciones con contención. Límite práctico ~1 escritura/seg sostenida por documento: sobrado para este negocio (decenas de pedidos al día). Si fracasa la transacción no se consume número (no hay huecos por error; sí puede haber huecos si se cancela un pedido, que es normal).
- Seguridad: el cliente no escribe `counters`; las reglas lo deniegan. Solo la Function lo toca.
- Numeración: arrancar en un valor inicial configurable (¿100? ¿1?) para no parecer tienda nueva; pregunta para Carlos. Formato compatible con DispatchTrack: confirmar longitud y caracteres máximos que acepta (**no verificado**).

## 3. Precio y descuento (servidor es la fuente de verdad)

- El cliente envía solo `[{sku, qty}]`, método de pago, despacho/retiro y datos de contacto. **Nunca precios ni totales.**
- Callable `createOrder` (región fija, validación de entrada con esquema, App Check obligatorio, límite de ítems/cantidad):
  1. Lee los productos en servidor, calcula precio efectivo (precio base menos descuento vigente por porcentaje o monto fijo; redondeo CLP entero, sin decimales), subtotal, envío ($3.990 o gratis sobre el umbral de `settings`, o $0 en retiro), total.
  2. Guarda en el pedido un **snapshot**: por ítem sku, nombre, precio unitario, descuento aplicado, y los totales. Este snapshot es lo que se cobra.
  3. Crea la orden de pago en Flow por el monto del snapshot (credenciales en Secret Manager).
- Confirmación Flow (`urlConfirmation`, endpoint HTTP): Flow envía un `token`; la Function **no confía en el cuerpo** sino que consulta `payment/getStatus` firmado y valida: estado pagado, `commerceOrder == orderNumber`, **monto == total del snapshot** y moneda CLP. Solo entonces marca `paid`. Es idempotente (si ya está `paid`, responde 200 sin repetir efectos). Si el monto no coincide: `payment_review` y alerta.
- Descuentos masivos: el admin los aplica sobre `products` (campos `discount`), con validación (porcentaje 0-100, monto fijo < precio). Los pedidos ya creados no cambian (snapshot).
- Detalles de la API de Flow (firma HMAC, endpoints, formato exacto): se leerán en la documentación oficial de Flow al implementar; no los he verificado aquí.

## 4. Correos transaccionales

Necesidad: resumen de compra, "Listo para retirar", "En ruta" (3 plantillas), bajo volumen.

| Opción | Pros | Contras |
|---|---|---|
| **Resend (API) llamado desde una Function que reacciona al cambio de estado del pedido** (recomendada) | Capa gratuita suficiente según mi memoria (verificar); plantillas en código; sin extensión que mantener; API key en Secret Manager; buena entregabilidad con dominio verificado. | Hay que verificar dominio con SPF/DKIM en el DNS de nutraelements.cl: **las credenciales de DNS están pendientes**. Servicio de terceros. |
| Extensión Trigger Email + SMTP del dominio | Poco código (se escribe un doc en `mail`); usa SMTP existente. | La extensión corre en Functions y requiere Blaze igualmente; manejo de credenciales SMTP en Secret Manager; el SMTP compartido de hosting suele tener límites y peor entregabilidad; el estado se maneja en documentos `mail` (más lecturas/escrituras). Se puede combinar con Resend por SMTP. |
| Gmail/Workspace SMTP | Nada que configurar. | Límites bajos, riesgo de bloqueo; no apto para producción. |

Mientras el DNS no esté listo, desarrollo con el emulador y un buzón de pruebas; no se puede enviar desde @nutraelements.cl sin verificarlo (necesita Carlos).

## 5. Región

- **Firestore: `southamerica-west1` (Santiago)**: es la ubicación más cercana a Chile. No pude consultar la lista oficial de ubicaciones de Firestore con la CLI (API deshabilitada); la creencia es que está soportada (verificar en la documentación al crear). La región **no se puede cambiar después**, y el bucket por defecto de Storage también queda fijo.
- **Functions: `southamerica-west1`**: confirmado en la tabla interna de firebase-tools (tier 2 de precio). Se define con `setGlobalOptions({region})`.
- **App Hosting: sin verificar.** Si Santiago no está disponible, propongo mantener Firestore y Functions en `southamerica-west1` y desplegar App Hosting en la región soportada más cercana (candidatas: `southamerica-east1` si existe, o `us-east4`/`us-east1`). Impacto: latencia SSR a Firestore (decenas a cientos de ms) mitigada con caché/ISR en páginas públicas, que además ayuda al SEO. Para cerrar esto falta que la cuenta suba a Blaze y correr `npx --no-install firebase apphosting:backends:create --help` / listar ubicaciones, o consultar la documentación.
- Orden: confirmar la lista de App Hosting **antes** de crear Firestore, porque su región es irreversible.

## 6. Entornos

Propuesta: **crear `nutra-elements-dev` nuevo y usar el existente `nutraelements` como prod.** Razón: `nutraelements` ya existe y es el ID de marca (los IDs son inmutables), así que evitamos crear dos proyectos nuevos y usar el vacío. Alias: `dev → nutra-elements-dev`, `prod → nutraelements`. Esto contradice la tarea 0.6 del PLAN, que menciona `nutra-elements-prod`: lo decide el tech-lead y se registra en DECISIONS.md. Alternativa: crear ambos (`-dev` y `-prod`) y dejar `nutraelements` sin uso: más limpio nominalmente, pero deja un proyecto huérfano. Ambos proyectos necesitan Blaze; el de dev cuesta ~$0. En local: Emulator Suite. NO se ha creado nada.

## 7. Blaze, alertas y riesgos de costo

- Blaze es necesario (App Hosting, Functions 2ª gen, Secret Manager, Cloud Build, Artifact Registry). Esto lo hace Carlos en la consola de facturación (requiere tarjeta).
- Presupuesto en Cloud Billing: 20 USD con alertas al 25%, 50%, 90% y 100% (con correo). Importante: **los presupuestos avisan, no cortan el gasto**. Alerta adicional en el proyecto dev (p. ej. 5 USD). Opcional: una Function que desactive la facturación al llegar al límite, solo si Carlos lo quiere, por el riesgo de bajar la tienda.
- Costos fijos esperados (orden de magnitud, sin verificar): Secret Manager (algunos centavos por secreto/versión), Artifact Registry/Cloud Build de cada despliegue, App Hosting (Cloud Run con mínimo de instancias en 0 para ahorrar; un mínimo >0 agrega costo continuo), Storage de imágenes (decenas de MB), egreso de red.
- Riesgos de costo concretos:
  - **Listado del admin**: no leer toda la colección en cada carga ni usar `onSnapshot` sin límite. Para ≤150 productos son 150 lecturas por carga; usar paginación, caché en cliente y evitar listeners permanentes. Los pedidos: paginar de 25 en 25 con índice por fecha.
  - **Carga masiva Excel**: procesar en una Function por lotes de 500 con `bulkWriter`, validando antes; leer cada producto una sola vez. Un archivo de 150 filas son ~300 operaciones: trivial, pero una carga mal hecha en bucle desde el cliente multiplica lecturas.
  - **Funciones en bucle**: un trigger que escribe el mismo documento que escucha genera recursión infinita (clásico y caro). Mitigación: comparar `before/after` y salir si el estado no cambió, idempotencia, `maxInstances` bajo (p. ej. 10), timeouts cortos, y alertas por invocaciones.
  - **Webhook de Flow reintentado** o atacado: validar siempre con `getStatus`, idempotente, y sin reintentos de la Function ante errores del cliente.
  - **Catálogo público**: SSR sin caché lee Firestore por cada visita (incluidos bots de buscadores). Usar ISR/caché, o `revalidate` y datos del catálogo en pocas lecturas. Es el principal riesgo a escala.
  - **Reglas con `get()`**: cada `get()` en reglas cuenta como lectura; el claim de admin evita eso.
  - **Escaneo y abuso**: App Check activado, límite de tasa en `trackOrder` y `createOrder`.
  - Funciones programadas: la de expiración corre cada 15 min (~2.900 invocaciones/mes), irrelevante en costo; Cloud Scheduler tiene jobs gratuitos por cuenta (verificar cuota).

## 8. Modelo de datos de alto nivel (borrador, NO es contrato)

Convención: dinero en CLP como entero; fechas `Timestamp`; claves de documento = identificador legible cuando aplique.

- `products/{sku}`: `sku`, `slug`, `name`, `description`, `category` (slug), `images[]` (rutas de Storage), `price`, `discount {type: "percent"|"fixed", value, startsAt?, endsAt?} | null`, `stock`, `active`, `createdAt`, `updatedAt`, campos SEO (`metaTitle`, `metaDescription`) y `variantOf?` (variantes: pendiente de ver el Excel). Se usa el SKU como ID (carga masiva por SKU, sin duplicados). `categories/{slug}` con `name`, `order`.
- `orders/{NE-000123}`: `orderNumber`, `status` (`pending_payment` | `payment_review` | `paid` | `preparing` | `ready_for_pickup` | `on_route` | `delivered` | `cancelled` | `expired`), `paymentMethod` (`flow` | `transfer`), `paymentStatus`, `uid?`, `customer {firstName, lastName, email, phone}`, `delivery {type: "shipping"|"pickup", commune, address}`, `items[] {sku, name, unitPrice, discount, qty, lineTotal}` (snapshot), `subtotal`, `shipping`, `total`, `reservedUntil`, `flow {token?, flowOrder?}`, `statusHistory[]`, `createdAt`, `updatedAt`. Estados exactos de pago/logística: por acordar con tech-lead.
- `counters/orders`: `{ next }`.
- `users/{uid}`: `firstName`, `lastName`, `email`, `phone`, `commune`, `address`, `createdAt`. El rol admin vive en el claim, no aquí. El historial se obtiene con `orders where uid == X orderBy createdAt desc` (índice compuesto).
- `settings/public`: `shippingFee` (3990), `freeShippingThreshold` (por definir), `storeAddress`, `storeHours`. `settings/private`: `transferBankInfo` (si se quiere), `reservationHours`.
- `metrics/daily/days/{YYYY-MM-DD}`: `ordersCount`, `revenue`. `metrics/productSales/items/{sku}`: `unitsSold`, `revenue`.
- `posts/{slug}`: `title`, `excerpt`, `body`, `coverImage`, `status` (`draft`|`published`), `publishedAt`, `authorUid`, `seo {}`.
- Índices previstos: `orders (uid, createdAt desc)`, `orders (status, createdAt desc)`, `products (active, category)`, `posts (status, publishedAt desc)`.

## 9. Preguntas abiertas para Carlos

1. Stock: ¿reservar al crear el pedido (recomendado; Flow 30 min, transferencia 48 h) o descontar solo al confirmar el pago?
2. ¿Cuántas horas se espera a un pago por transferencia antes de liberar el stock?
3. ¿Subes `nutraelements` a Blaze (tarjeta) y fijas alertas de presupuesto? Sin esto no puedo ni listar las regiones de App Hosting.
4. Entornos: ¿`nutra-elements-dev` nuevo + `nutraelements` como prod (recomendado), o crear ambos nuevos?
5. Número inicial de pedido (NE-000001 u otro) y formato admitido por DispatchTrack.
6. Acceso al DNS de nutraelements.cl para verificar el dominio de correo (SPF/DKIM). Sin eso, los correos de producción no podrán salir con ese remitente.
7. Monto de envío gratis, dirección y horario de retiro, y el Excel de productos (variantes: ¿hay tallas/sabores como productos separados o como variantes?).
8. ¿Hay apertura de Flow producción lista, o solo sandbox? (afecta al plazo).
9. Flow: ¿cuántos pedidos al mes se esperan? Si superan cientos/miles diarios, reevaluar Data Connect.

## 10. Qué necesito de otros agentes

- **tech-lead**: decidir y registrar en DECISIONS.md (Firestore, entornos, región, política de reserva); reconciliar el alias `prod` de la tarea 0.6 y corregir el texto de ejemplo de pasarela en AGENTS.md.
- **Carlos (vía tech-lead)**: pasar a Blaze, las respuestas de arriba y acceso al DNS.
- **devops**: tras la aprobación, crear `nutra-elements-dev`, `.firebaserc`, `firebase.json` y el presupuesto con alertas. No lo hice yo.
- **nextjs-frontend**: a futuro, el contrato `docs/team/contracts/` (modelo y callables) saldrá de este borrador una vez aprobado. Para el catálogo SSR, usar ISR/caché.
- **seo-specialist**: confirmar si las páginas de producto y categoría deben ser estáticas con revalidación (impacta el diseño de lecturas).
- **qa-reviewer**: revisión prioritaria de reglas de `orders`, `counters`, `metrics` y de la validación del monto en el webhook de Flow.
