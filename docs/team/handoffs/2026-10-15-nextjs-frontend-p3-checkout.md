# Handoff nextjs-frontend: P3 carrito, checkout y confirmación (D-028)

Fecha: 2026-10-15. Estado: terminado, pendiente de revisión. Sin git, Firebase ni emuladores. Todo el pago es simulado.

## Qué quedó
- `/carrito`: líneas con imagen, nombre, precio (con descuento si hay), cantidad (− / +), quitar y subtotal; resumen (productos, descuentos, subtotal, nota "envío en el checkout"); estado vacío; carga; botón "Ir a pagar" (deshabilitado si hay productos sin stock o que ya no existen).
- `/checkout` (una sola página): datos (nombre, apellido, correo, teléfono, RUT obligatorio), entrega (despacho RM con comuna y dirección, o retiro), pago (Flow o transferencia), resumen con "el total final lo confirma el servidor". Errores por campo con resumen enfocable, `aria-invalid`/`aria-describedby`, `autocomplete` e `inputmode`.
- `/checkout/flow-simulado`: "Redirigiendo a Flow (simulado)" con "Simular pago aprobado" y "Simular pago rechazado".
- `/pedido/[numero]?t=<token>`: número NE-xxxxxx destacado, indicación de guardarlo y de usarlo en DispatchTrack, estado del pago (reintento si fue rechazado; datos bancarios de prueba y reserva de 48 h en transferencia; reserva vencida), entrega y resumen. No muestra ni guarda RUT, correo, teléfono ni dirección.
- Banner "Prototipo: los pagos son simulados" en las cuatro páginas. Todas son dinámicas (`force-dynamic`) y con `robots: noindex, nofollow` (también `X-Robots-Tag`).

## Interfaz simulada (`src/lib/checkout/`)
- `types.ts` (ya existía): tipos iguales al contrato functions.md 3.1, 3.2 y 3.4, más `OrderServiceError`.
- `mock-service.ts`: `createMockOrderService({ storage, catalog?, settings?, now? })` implementa `OrderService` (`createOrder`, `createFlowPayment`, `getOrderStatus`) y agrega `simulateFlowResult(ref, "approved" | "rejected")` (el botón de la pantalla de Flow; no existe en el contrato). El estado vive en localStorage: `ne.orderSeq.v1` (contador), `ne.orders.v1`, `ne.orderReq.v1` (idempotencia por `clientRequestId`).
  - Numeración `NE-000001` incremental. Token de acceso aleatorio, que viaja en `?t=`; sin token o con token incorrecto da `ORDER_NOT_FOUND`.
  - Reserva de 30 min con Flow y 48 h con transferencia; pasado ese plazo el estado se ve como `expired`.
  - Valida RUT (`INVALID_RUT`), SKU duplicados, cantidades, comuna, retiro, existencia y stock (`OUT_OF_STOCK`, `PRODUCT_UNAVAILABLE`).
  - Datos bancarios de prueba (`TEST_BANK_DATA`) marcados como tales en pantalla.
- `index.ts`: `getOrderService(deps?)` (solo navegador). Para producción se reemplaza por llamadas a las Functions detrás de `OrderService`.
- `summary.ts`: `computeSummary` (subtotal, descuentos, envío, total, envío gratis con `subtotal >= umbral`; umbral inválido = sin envío gratis, D-027). `toCatalogEntry`.
- `validation.ts`: `validateCheckout` (reglas del contrato, normaliza RUT y teléfono).
- `server.ts` (solo servidor): `loadCheckoutData()` arma el catálogo compacto y los ajustes desde `@/lib/data`; es como llegan los precios al cliente (el carrito sigue guardando solo `{sku, qty}`).
- `src/lib/rut.ts` y su test: se reutilizaron tal cual (copia de `functions/src/common/rut.ts`).

## Archivos
Nuevos, todos dentro de mi área: `src/app/carrito/page.tsx`, `src/app/checkout/page.tsx`, `src/app/checkout/flow-simulado/page.tsx`, `src/app/pedido/[numero]/page.tsx`, `src/components/checkout/*` (CartView, CheckoutForm, OrderSummary, FlowSimulatedView, OrderStatusView, PrototypeBanner y dos CSS Modules) y `src/lib/checkout/*` (summary, validation, mock-service, server, index y sus tests). No toqué componentes ni código compartido; la capa de datos y el carrito se usan tal como están.

## Decisiones
- Variable de entorno de demo `DEMO_FREE_SHIPPING_THRESHOLD` (entero positivo, leída en el servidor en `server.ts`): el mock de datos trae `freeShippingThreshold: null`, así que sin ella no se puede probar el envío gratis. Sin la variable, no hay envío gratis. Hay que borrarla antes de producción (el umbral real vendrá de `settings/public`).
- El RUT no se guarda en ningún lado en el prototipo (ni en el pedido simulado).
- Transferencia: los datos bancarios y la reserva de 48 h se muestran en `/pedido/...` (donde se vuelven a consultar con el número y el token), no en una pantalla aparte.
- El rechazo de Flow deja el pedido en `pending_payment` con `lastPaymentAttemptRejected` (extensión del prototipo en `GetOrderStatusResponse`, ver `types.ts`).
- Cantidad máxima por producto: la del carrito (10 fijo).

## Pedidos al tech-lead
- Unificar `src/lib/rut.ts` y `functions/src/common/rut.ts` en un solo módulo compartido (hoy son copias).
- Si se quiere mostrar el rechazo del último intento de Flow en producción, `getOrderStatus` debe exponerlo (hoy no está en el contrato).
- Falta `/checkout/retorno` (route handler GET/POST del contrato 3.3.1) y el polling de `getOrderStatus`: no aplican en el simulado.
- Estas rutas no deben aparecer en `sitemap.ts` (no lo toqué).

## Verificación
- `npx eslint` sobre mis rutas, `src/lib/checkout` y `src/lib/rut*`: sin errores. `npm run lint` global falla por un archivo de P4 (`src/lib/admin/dbg.test.ts`, `no-require-imports`), fuera de mi área.
- `npm test`: 14 archivos, 165 tests en verde (la corrida anterior tuvo 2 fallos en tests de `src/lib/admin` de P4 que luego se corrigieron). Los míos: RUT, resumen (descuentos, despacho, retiro, umbral en el borde, umbral inválido, SKU ausentes), validación y servicio simulado (numeración, idempotencia, token, sin datos personales, reservas, Flow rechazado/aprobado): 65 tests con rut.
- `npm run build`: OK. `/carrito`, `/checkout`, `/checkout/flow-simulado` y `/pedido/[numero]` salen como dinámicas (ƒ).
- `next start -p 3583` + curl: las cuatro rutas devuelven 200 con `<meta name="robots" content="noindex, nofollow"/>` y el banner; `X-Robots-Tag: noindex, nofollow`. Servidor cerrado.

## Sin verificar
- La interacción en el navegador (no hay herramienta): agregar al carrito, formulario, redirecciones, localStorage. Usa el paso a paso de abajo.
- Accesibilidad con herramienta (axe/Lighthouse), lector de pantalla, foco tras error y contraste solo por cálculo.
- 360 px, 768 px y 1280 px solo por CSS, sin captura.
- Reserva vencida (se prueba en unit test, no a mano).

## Prueba manual
Arranca con `npm run build` y luego `DEMO_FREE_SHIPPING_THRESHOLD=30000 npx next start -p 3583` (no uses `next dev`). Abre http://localhost:3583. Para reiniciar, borra en las DevTools (Application, Local Storage) las claves `ne.*`.

1. Carrito: ve a `/productos`, agrega 2 o 3 productos. En `/carrito` cambia cantidades con + y −, quita uno, recarga (se mantiene). Con el carrito vacío debe verse el estado vacío.
2. Despacho con Flow aprobado: "Ir a pagar". Deja "Despacho", elige comuna (p. ej. Puente Alto), escribe una dirección, elige Flow y confirma con datos válidos (RUT `12.345.678-5`). Debe verse "Redirigiendo a Flow (simulado)" y el carrito debe quedar vacío. Pulsa "Simular pago aprobado". En `/pedido/NE-000001` aparece el número destacado, "Pago aprobado", la comuna y el despacho $3.990 (o Gratis si el subtotal es de $30.000 o más).
3. Flow rechazado: repite con otro pedido y pulsa "Simular pago rechazado". El pedido muestra "El pago fue rechazado" y "Reintentar pago con Flow", que vuelve a la pantalla de Flow; esta vez apruébalo. El número debe ser NE-000002.
4. Transferencia: nuevo pedido con "Transferencia bancaria". Va directo a `/pedido/...` con los datos bancarios de prueba, el monto exacto, la referencia y "Reservamos tus productos por 48 horas".
5. Retiro: elige "Retiro en tienda" (desaparecen comuna y dirección; el envío pasa a Gratis). El pedido muestra Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00.
6. RUT inválido: escribe `12.345.678-4` o déjalo vacío y confirma. Debe aparecer el resumen de errores (enfocado) con el enlace al campo y el mensaje bajo el RUT; nada se crea. Prueba también correo y teléfono inválidos.
7. Envío gratis: con el umbral de $30.000 elige "Despacho" y un subtotal menor; debe cobrar $3.990 y avisar cuánto falta. Súbelo a $30.000 o más: Despacho Gratis y el aviso de envío gratis. Sin la variable de entorno nunca hay envío gratis.
8. Pedido ajeno: abre `/pedido/NE-000001` sin `?t=` o con otro token. Debe decir que no encontramos el pedido. El pedido nunca muestra el RUT.
