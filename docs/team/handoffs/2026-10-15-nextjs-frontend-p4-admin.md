# Handoff nextjs-frontend: P4 admin en "Modo demostración" (D-028)

Fecha: 2026-10-15. Estado: terminado, pendiente de revisión. Sin git, sin Firebase, sin emuladores.

## Qué quedó
Panel `/admin` completo con datos simulados, todo dinámico y con noindex:
- `/admin/login`: cualquier correo y contraseña ingresan (sessionStorage). Lleva el rótulo "Modo demostración: sin autenticación real".
- Layout: barra lateral (Resumen, Productos, Importar Excel, Descuentos, Pedidos, Ajustes), banner fijo "Modo demostración: los cambios no se guardan" y botón Salir. En móvil, barra superior con botón Menú (`aria-expanded`, cierra con Escape y al elegir un enlace).
- `/admin`: 5 tarjetas (ventas netas, pedidos, ticket promedio = neto / pedidos, reembolsos y monto reembolsado), gráfico de barras por día en SVG (sin librerías, con tabla equivalente en un `<details>`), top 10 y productos sin stock, rango de 7, 30 y 90 días.
- `/admin/productos`, `/nuevo` y `/[sku]`: tabla con búsqueda y filtros (categoría, estado, stock); edición de Contenido y de Comercio en formularios separados; imágenes (subir con vista previa, WebP en el navegador con canvas, lado largo <= 1600 px y <= 2 MiB, reordenar, quitar, texto alternativo obligatorio); publicar, despublicar y desactivar (no se borra); "Nuevo producto".
- `/admin/importar`: tres pestañas (Control Farma, SKU + PRECIO, SKU + STOCK). SheetJS con `import()` dinámico, vista previa (dryRun) con filas válidas "antes → después", filas inválidas con código y motivo (`SKU_NOT_FOUND`, `INVALID_PRICE`, `EMPTY_STOCK`, etc.), valores corregidos y advertencias, y botón "Aplicar (simulado)".
- `/admin/descuentos`: por selección, por categoría o por lista de SKU; porcentaje, monto fijo o quitar; vista previa de precio actual → nuevo; lista de productos con descuento y "Quitar".
- `/admin/pedidos` y `/[orderNumber]`: lista con filtro por estado (incluye "Reembolsado") y búsqueda; detalle con cliente (con RUT), entrega, ítems, totales, transferencia, reembolso e historial (`statusHistory`). Solo se muestran las acciones permitidas: confirmar transferencia, avanzar estado, retroceder un paso (motivo obligatorio), cancelar (solo `pending_payment`) y registrar reembolso manual (monto, medio, fecha, nota, casilla "reponer stock").
- `/admin/ajustes`: costo de despacho, umbral de envío gratis (vacío = desactivado), retiro (dirección y horario), datos bancarios de prueba, máximo por producto y reserva (minutos para Flow, horas para transferencia).

## Archivos
- Páginas: `src/app/admin/layout.tsx`, `page.tsx`, `admin-global.css`, `login/`, `productos/` (`page`, `nuevo/`, `[sku]/`), `importar/`, `descuentos/`, `pedidos/` (`page`, `[orderNumber]/`), `ajustes/`.
- Componentes: `src/components/admin/*` (AdminProvider, AdminShell, LoginForm, MetricsView, DailyChart, ProductsView, ProductEditor, ImageManager, NewProductForm, ImportView, DiscountsView, OrdersView, OrderDetail, OrderStatusBadge, SettingsView, format.ts, `admin.module.css`, `AdminShell.module.css`).
- Lógica: `src/lib/admin/*` (ver abajo) con 5 archivos de tests (`orders`, `batch`, `image`, `metrics`, `demo-service`; 75 tests).
- `package.json` y el lockfile: `xlsx` ya estaba en `dependencies` (mismo 0.20.3 y misma fuente del CDN de SheetJS) cuando llegué; verifiqué que el lockfile es coherente (sin `"dev": true`). No hice más cambios ahí.
- Cambios en archivos compartidos: ninguno.

## La interfaz simulada (`src/lib/admin/`)
- `config.ts`: `DEMO_MODE` (con el comentario de que el login simulado NO puede llegar a producción, D-028), clave de sesión y texto del banner. Si `DEMO_MODE` es false, el shell muestra un aviso en vez del panel.
- `service.ts`: interfaz `AdminService`, con los nombres, parámetros y códigos de error calcados de functions.md secciones 4 y 5: `importCatalog`, `importPrices`, `importStock`, `applyDiscount`, `setProductsPublished`, `createProduct`, `updateProductCommerce`, `confirmTransferPayment`, `cancelOrder`, `updateFulfillment`, `recordManualRefund`. Más escrituras directas (`updateProductContent`, `saveSettings`) y lecturas (`getState`, `subscribe`). Los errores son `AdminServiceError { code }`, equivalente a `HttpsError` + `details.code`.
- `demo-service.ts`: implementación en memoria; se reinicia al recargar. Solo ahí hay simulación; las pantallas dependen de `AdminService`.
- Reglas puras con tests, reutilizables por las Functions reales: `orders.ts` (matriz de transiciones, `allowedActions`, reembolso D-024), `batch.ts` (SKU como texto, precios `12.990`/`$12.990`, `EMPTY_STOCK` vs corrección a 0, `DISCOUNT_REMOVED`, máximo 1000 filas), `pricing.ts` (fórmula 7.3), `metrics.ts` (regla D-025), `image.ts` (`fitWithin`, `fitToBudget`), `excel-file.ts` (SheetJS).
- Datos: `seed.ts` toma el catálogo público (`@/lib/data`), asigna un stock ficticio estable (hash del SKU; no usa la cantidad real de la planilla) y genera unos 340 pedidos de los últimos 90 días con un generador con semilla fija (sin `Math.random`). Incluye siempre pedidos pendientes, expirado, cancelado y reembolsados (con y sin reposición). El "ahora" se fija una vez por pestaña.
- Cómo se monta: el layout (servidor) lee `getProducts()` y `getPublicSettings()` y se los pasa a `AdminProvider`. El panel no se renderiza hasta conocer la sesión del navegador (sin desajustes de hidratación).

## Decisiones
- El layout raíz monta el header y el footer de la tienda para todas las rutas. Sin tocar `layout.tsx`, `admin-global.css` los oculta (`display: none`, también para teclado y lectores) con `body:has([data-admin-root])`. Alternativa limpia a futuro: grupos de rutas `(tienda)` y `(admin)` con layouts raíz distintos.
- Las métricas se calculan desde la lista de pedidos con las reglas de data-model 2.6 (día de `paidAt` en America/Santiago); en producción serán lecturas de `metrics/*`.
- Retroceder, cancelar y reembolsar usan formularios con motivo o nota obligatorios, no un diálogo de confirmación.
- La demo permite publicar solo si se cumplen las reglas de 5.5 (slug único, descripción, categoría, imagen con alt). Por eso, tras despublicar un producto de la demo, volver a publicarlo falla con `MISSING_DESCRIPTION`. Es lo esperado; sirve para mostrar la validación.
- El texto de ayuda de Contenido recuerda la prohibición de declaraciones de salud.

## Pedidos al tech-lead
1. `setProductActive` (desactivar o activar) es solo de la demo: en el contrato `active` viene únicamente de la planilla (ACTIVO) y las reglas solo dejan al admin editar contenido. Si Carlos quiere el interruptor "desactivar", firebase-architect debe agregar una función.
2. `resolvePaymentReview` (4.2) no tiene pantalla: los pedidos en `payment_review` solo se ven, sin acciones. Se puede agregar en la integración real.
3. Cabecera noindex: con `SITE_INDEXABLE=true`, `/admin` queda solo con `<meta name="robots" content="noindex">` (y robots.txt con `Disallow: /admin/`), sin `X-Robots-Tag`, porque la cabecera de `next.config.ts` solo se aplica con el sitio no indexable. Recomiendo agregar una cabecera `X-Robots-Tag: noindex, nofollow` para `/admin/:path*` siempre (archivo fuera de mi área).
4. Antes de producción: eliminar `src/lib/admin/` (versión demo), `session.ts`, `LoginForm` y `AdminShell`, y reemplazar por Firebase Auth con claim `admin` (D-011) y `httpsCallable`. qa-reviewer debe bloquear si queda `DEMO_MODE = true`.
5. Lotes de más de 1000 filas: hoy se rechazan con `TOO_MANY_ROWS`; el contrato dice que el cliente los parte. Con 33 productos no hace falta aún.

## Verificación ejecutada
- `npm run lint`: sin errores. `npm test`: 15 archivos, 171 tests en verde (75 son del admin). `npm run build`: OK; las 10 rutas `/admin/*` salen como dinámicas (ƒ).
- `next start -p 3474`: `/admin/login`, `/admin`, `/admin/productos`, `/importar`, `/descuentos`, `/pedidos`, `/pedidos/NE-000001`, `/ajustes` y `/productos/nuevo` responden 200 con `X-Robots-Tag: noindex, nofollow` y `<meta name="robots" content="noindex, nofollow...">`. `robots.txt` pre-lanzamiento: `Disallow: /`; con `SITE_INDEXABLE=true` (build aparte): `Disallow: /admin/` y `/api/`. Servidores cerrados.
- Interacción real con Edge headless por CDP (consola sin errores ni advertencias): redirección sin sesión a login y vuelta; tarjetas y top 10; filtros de productos; publicar con validación; edición de contenido y de comercio con error de precio; subida de una PNG de 3200×2400 que quedó en WebP 1600×1200; importación de un `.xlsx` de precios, un `.csv` de stock y la planilla real `.xls` (33 filas, 31 con cambios, 1 sin cambios, 1 `EMPTY_STOCK`) y columnas faltantes; descuento por categoría, lista de SKU con `DISCOUNT_TOO_HIGH`, quitar; filtro por "Reembolsado"; confirmar transferencia, avanzar, retroceder con y sin motivo, reembolso con monto inválido y válido con reposición; ajustes con valor inválido y válido; menú móvil con cierre por Escape; salir. Sin desborde horizontal a 360 px en 6 pantallas. Capturas a 1280 y 360 px revisadas.

## Sin verificar
- Auditoría de accesibilidad con herramienta (axe/Lighthouse), contraste medido solo por cálculo con los tokens, y lector de pantalla. Foco visible y áreas táctiles de 44 px solo por CSS, no medidos.
- 768 px y las pantallas de importar, descuentos y ajustes a 360 px: solo revisé el desborde horizontal, no la estética.
- Pestañas con `aria-pressed` (no patrón `tablist` completo).
- Compresión a WebP en Safari y Firefox (se probó en Edge). Si el navegador no genera WebP, muestra un error.
- El `.xls` de 33 filas es lo único que se probó con un archivo real; no se probó el límite de 5 MiB ni archivos corruptos.
- Reglas de la sesión: `sessionStorage` se pierde al cerrar la pestaña (intencional).

## Prueba manual (paso a paso)
Desde la raíz del repo: `npm run build` y `npx next start -p 3474` (no usar `next dev`, reescribe AGENTS.md). Abre http://localhost:3474/admin y cierra el servidor al terminar.
1. Entra a `/admin`: te lleva a `/admin/login` con el rótulo "Modo demostración: sin autenticación real". Pulsa Ingresar (o escribe cualquier cosa) y llegas a Resumen.
2. Resumen: cambia entre 7, 30 y 90 días (las tarjetas y el gráfico cambian), abre "Ver los datos por día en una tabla", revisa el Top 10 y la lista de productos sin stock.
3. Productos: busca "magnesio" (6 resultados), filtra por Stock "Sin stock", pulsa Despublicar y luego Publicar (falla con `MISSING_DESCRIPTION`, a propósito). Entra a un producto: en Contenido escribe una descripción y elige categoría; en Comercio pon un precio inválido ("abc") para ver el error. En Imágenes sube una foto grande: verás "convertida a WebP ... → ...", prueba mover y quitar; sin texto alternativo no deja guardar. Con descripción, imagen guardada y slug, Publicar funciona. "Nuevo producto" crea uno sin publicar.
4. Importar Excel: pestaña SKU + PRECIO con un `.xlsx` de columnas SKU y PRECIO (incluye un SKU inexistente y un precio con decimales); revisa los cambios antes → después y los inválidos, y pulsa "Aplicar (simulado)". En SKU + STOCK usa un `.csv` con una celda de stock vacía (`EMPTY_STOCK`) y un negativo (se corrige a 0). En Control Farma carga `productos_nutra_elements.xls` de la raíz (ignorado por git). Si subes un archivo sin las columnas, ves cuáles faltan.
5. Descuentos: elige "Una categoría" (Magnesio), 15 %, Vista previa y Aplicar. Luego "Lista de SKU" con un monto fijo mayor al precio para ver `DISCOUNT_TOO_HIGH`. Quita descuentos desde la lista inferior.
6. Pedidos: filtra por "Reembolsado". Filtra "Pago pendiente" y abre uno: Confirmar transferencia, luego Avanzar hasta "Entregado", intenta Retroceder sin motivo (error) y con motivo (queda en el historial como "Retroceso"). Registra un reembolso (monto 0 da error; con monto válido y "Reponer stock" el pedido queda "Reembolsado" y sin acciones). Vuelve a Resumen: aparecen en reembolsos.
7. Ajustes: vacía el umbral de envío gratis (desactivado), pon un valor de Flow fuera de rango (5 a 240) para ver el error y luego uno válido.
8. En 360 px (herramientas del navegador) usa el botón Menú; cierra con Escape. Pulsa Salir: vuelves al login, y entrar directo a `/admin/pedidos` sin sesión redirige al login.
9. Recarga: todos los cambios vuelven a los datos iniciales (es lo esperado).
