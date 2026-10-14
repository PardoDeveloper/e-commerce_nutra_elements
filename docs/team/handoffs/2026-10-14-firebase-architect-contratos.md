# Handoff firebase-architect: contratos 2A.1 y 2A.2

Fecha: 2026-10-14. Solo documentos. No se escribió código ni configuración, no se creó nada en Firebase, no se tocó git, `.env`, la planilla ni los archivos protegidos (AGENTS.md, PLAN.md, DECISIONS.md, DESCUBRIMIENTO.md, contracts/seo/).

## Archivos creados
- `docs/team/contracts/data-model.md` (2A.1): colecciones, campos, matriz de acceso, Storage, índices, máquina de estados, dinero y envío.
- `docs/team/contracts/functions.md` (2A.2): 20 funciones con tipos TypeScript y errores, variables y secretos, revalidación ISR, plan de tests.
- Este handoff.

## Decisiones que tomé (el tech-lead debe aprobarlas)
1. **Stock con dos contadores**: `stock` = disponible (D-006 literal) y `reserved` = reservado por pedidos pendientes. Las importaciones de stock guardan `max(0, físico - reserved)`. Evita pisar reservas al subir el Excel.
2. **Dos ejes de estado**: `paymentStatus` (los 5 pedidos) y `fulfillmentStatus` (`preparing`, `ready_for_pickup`, `on_route`, `delivered`, solo con pedido pagado). Más `stockState` (`reserved`, `committed`, `released`) que impide liberar dos veces.
3. **Sin colección de reservas**: la reserva vive en el pedido. Colecciones extra: `paymentEvents/{flowToken}` (idempotencia de Flow), `idempotencyKeys` (idempotencia de `createOrder`) y `rateLimits`, con TTL.
4. **Acceso público al estado del pedido**: `getOrderStatus(número + token)`. Token de 32 bytes aleatorios; en el pedido solo se guarda su hash SHA-256. Número inexistente y token malo dan el mismo error. No devuelve email, teléfono ni dirección. Un reintento idempotente de `createOrder` rota el token.
5. **Descuento**: un solo descuento por producto, reemplaza al anterior, sin fechas. `finalPrice` se guarda derivado y el servidor lo recalcula al cobrar. Porcentaje: `floor((price*(100-v)+50)/100)` (mitades hacia arriba); fijo: `price - v`; clamp a `[0, price]`. Se valida porcentaje 1–99 y fijo menor que el precio. Un cambio de precio que invalide un descuento fijo lo elimina con advertencia.
6. **Envío gratis combina con descuentos**: el umbral se compara con el subtotal ya descontado, con `>=`. Sin umbral (`null`) no hay envío gratis. (Mi decisión, por confirmar.)
7. **Comunas** en `settings/public.communes` (52 de la RM, editable): fuente única para el selector y para la validación.
8. **Admin escribe directo solo contenido** (nombre, descripción, imágenes, categoría, slug si no está publicado, SEO). Precio, descuento, stock, publicación y activo solo por Functions. Las reglas no pueden validar cada elemento del arreglo `images`; lo hace la función de publicación.
9. **Excel se lee en el navegador** y se envían filas crudas JSON (máx. 1000) a la callable, con `dryRun` para vista previa. No pasa por Storage. Aplicación parcial con reporte de filas inválidas.
10. **Revalidación por triggers de Firestore** (`onProductWritten`, etc.), no desde cada función. Cambios solo de `stock` sin cambiar `inStock` no revalidan. Llamada a `POST /api/revalidate` firmada con HMAC-SHA256 (`x-ne-timestamp`, `x-ne-signature`, ventana de 5 min) y lista blanca de rutas; secreto `REVALIDATE_SECRET`.
11. **Reconciliación**: `getOrderStatus` consulta `getStatus` de Flow si el pago sigue pendiente (máx. cada 15 s), reutilizando la rutina idempotente de `flowConfirm`. Cubre confirmaciones retrasadas y el caso local sin túnel. Antes de expirar un pedido de Flow, el job también consulta `getStatus`.
12. **Guardas de ambiente**: `APP_ENV` (`local`, `staging`, `production`) con `FLOW_API_BASE` coherente; si no, la función no arranca. Evita cobrar de verdad por error en el pre-lanzamiento.
13. Un pedido `paid` no se cancela en el MVP (el reembolso va a mano en Flow). El estado logístico solo avanza.
14. Job de reservas cada 5 minutos (la reserva de Flow dura 30).

## No verificado (declarado en los contratos)
- Toda la API de Flow (parámetros, firma, estados 1 a 4, reintentos de la confirmación, si el retorno al navegador es POST, si se puede repetir `commerceOrder`): está escrita de memoria y marcada VERIFICAR para la tarea 2B.4.
- Opciones exactas de `firebase-functions` v2, ubicación de `.secret.local` y `.env` en el emulador, sintaxis TTL en `firestore.indexes.json`, cuota gratuita de Cloud Scheduler, si se puede desactivar el auto-registro de Auth sin Identity Platform, y la librería para leer `.xls`.

## Preguntas abiertas (detalle en data-model.md sección 10 y functions.md sección 11)
1. Categorías reales (la planilla no las trae).
2. Confirmar reservas de 30 min (Flow) y 48 h (transferencia).
3. Número inicial de pedidos y formato en DispatchTrack.
4. Días de atención del retiro.
5. Cancelar o reembolsar un pedido ya pagado.
6. Pedir RUT para la boleta o factura manual.
7. Retención de datos personales de pedidos.
8. Tamaño máximo de imagen (propuse 2 MiB).
9. Retroceder un estado logístico.
10. Ofertas con fecha de inicio y fin.
11. Envío gratis: combinación con descuentos y `>=` frente a `>`; monto sin definir.
12. Proveedor de login del admin y MFA.
13. Si reimportar la planilla pisa un precio editado a mano (propuse que sí).
14. Límites anti-abuso propuestos (5 pedidos por 10 min por IP, 3 pendientes por correo, 30 consultas de estado por 10 min).
15. Excel de stock: celda vacía inválida (propuesta) o 0.
16. Doble descuento entre el stock físico de Control Farma y las reservas.
17. Cómo se entera el admin de pedidos en revisión sin correos, y cómo recupera el cliente un número perdido.

## Qué necesita nextjs-frontend (detalle en functions.md sección 10)
- Cliente de Functions en `us-east4`; App Check en producción.
- Flujo de checkout: `createOrder` (con `clientRequestId` UUID), `createFlowPayment` y redirección; transferencia con `getOrderStatus`.
- Route handler `/checkout/retorno` (GET y POST, responde 303) y página de confirmación con polling de `getOrderStatus` (noindex, sin referrer).
- Route handler `POST /api/revalidate` con la verificación HMAC y la lista blanca del contrato.
- Lecturas públicas con Admin SDK en servidor (ISR), sin listeners en el sitio público; paginación de 25 en el admin y como máximo un `onSnapshot`.
- Subida de imágenes a Storage desde el navegador (compresión previa recomendada) y lectura de Excel en el navegador.
- `next/image` con el host del bucket en `remotePatterns`.

## Qué necesito del tech-lead
- Aprobación de ambos contratos y respuesta a las preguntas abiertas que bloquean: 1 (categorías), 3, 5, 6, 11 y 15.
- Que Carlos confirme las reservas (D-006) y el valor de envío gratis cuando lo tenga.
- Para 2B.4: aprobación de la herramienta de túnel (D-021) y acceso a la documentación oficial de Flow.
- Para devops (cuando toque): política TTL, `.gitignore` de `functions/.secret.local` y `functions/.env*`, y entregar la URL desplegada de `flowConfirm` para `FLOW_CONFIRMATION_URL`.
