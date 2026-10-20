# Handoff nextjs-frontend: eliminar productos con selección múltiple (D-029)

Fecha: 2026-10-19. Estado: terminado, pendiente de revisión. Sin git, sin Firebase, sin dependencias nuevas. Es la demo del admin (D-028): nada persiste al recargar y la tienda pública (`@/lib/data`) no se ve afectada.

## Qué quedó
- **Tabla de productos (`/admin/productos`)**
  - Columna de casillas por fila, con un label oculto "Seleccionar {nombre}", y casilla de encabezado "Seleccionar todos los productos de la lista filtrada". Opera solo sobre la lista visible y queda indeterminada si la selección es parcial.
  - Área táctil de 44 px por casilla.
  - Barra de acciones (`role="region"`, `aria-live="polite"`) con "N seleccionados", "Eliminar seleccionados" y "Limpiar selección". Una selección oculta por un filtro no se opera: solo cuenta lo visible.
- **Confirmación (`ConfirmDeleteDialog`)**
  - `<dialog>` nativo con `showModal()`: foco atrapado, resto inerte, Escape cierra y el foco vuelve a "Eliminar seleccionados".
  - Dice cuántos se eliminan y lista hasta 10 nombres más "y N más".
  - Con más de 5, Confirmar se habilita solo al escribir `ELIMINAR` (exacto, en mayúsculas).
  - Más de 200: error claro (`TOO_MANY_ROWS`) antes de abrir el diálogo, y el servicio también lo rechaza.
- **Servicio**
  - `deleteProducts({skus})` y `restoreProducts({skus})` en `AdminService` y en la demo. Devuelven `{rows, deleted|restored, deletedSkus|restoredSkus, invalid[], skipped}`.
  - Códigos por fila: `SKU_NOT_FOUND`, `DUPLICATE_SKU`, `ALREADY_DELETED`, `NOT_DELETED`. Más de 200 lanza `TOO_MANY_ROWS`; vacío, `EMPTY_BATCH`.
  - Eliminar: `deletedAt`, `deletedBy="demo-admin"` y `published=false`. Restaurar: limpia ambos campos y queda despublicado.
  - Campos nuevos obligatorios en `AdminProduct`: `deletedAt` y `deletedBy` (`string | null`).
- **Filtro "Eliminados"** (opción nueva en Estado)
  - Por defecto la tabla no muestra eliminados.
  - El filtro los muestra con badge "Eliminado" y fecha, selección múltiple y "Restaurar seleccionados" (sin diálogo ni palabra).
  - Sin acciones de publicar o desactivar sobre ellos.
- **Coherencia**
  - Las tres importaciones (planilla, precio y stock) marcan `PRODUCT_DELETED` como fila inválida, sin revivir ni cambiar el producto ni crearlo de nuevo. También `applyDiscount` y `setProductsPublished`.
  - El mensaje del motivo está en español y las ayudas de las pestañas de Importar lo mencionan.
  - Descuentos no ofrece eliminados (selección, categoría ni lista de descuentos vigentes).
  - Resumen: "sin stock" ignora eliminados. Las métricas y los pedidos se calculan desde los pedidos, que tienen snapshot, así que siguen igual.
  - En la edición individual, un producto eliminado muestra "Producto eliminado" con el botón Restaurar. Al restaurar vuelve el editor.
  - El servicio rechaza con `PRODUCT_DELETED` editar contenido o comercio, desactivar y publicar un eliminado. Crear con el SKU de un eliminado explica que hay que restaurarlo.
- Mensaje de éxito con conteo, selección limpia y tabla actualizada, tanto al eliminar como al restaurar. El foco pasa al contador de resultados.

## Archivos
- Nuevos
  - `src/components/admin/ConfirmDeleteDialog.tsx`
  - `src/lib/admin/selection.ts`
  - `src/lib/admin/selection.test.ts`
  - `src/lib/admin/delete.test.ts`
- Editados
  - `src/lib/admin/types.ts`
  - `src/lib/admin/service.ts`
  - `src/lib/admin/demo-service.ts`
  - `src/lib/admin/batch.ts`
  - `src/lib/admin/seed.ts`
  - `src/lib/admin/testing.ts`
  - `src/components/admin/ProductsView.tsx`
  - `src/components/admin/ProductEditor.tsx`
  - `src/components/admin/DiscountsView.tsx`
  - `src/components/admin/MetricsView.tsx`
  - `src/components/admin/ImportView.tsx`
  - `src/components/admin/admin.module.css`
- Archivos compartidos o fuera de mi área: ninguno modificado.

## Decisiones
- `<dialog>` nativo en vez de una librería o de un trampa de foco propia: es lo más accesible sin dependencias. Escape se maneja con el evento `cancel`.
- Los lotes de eliminar/restaurar lanzan error si hay más de 200 (como `setProductsPublished` con 150), en vez de marcar filas. `TOO_MANY_ROWS` por fila no aplica.
- La selección se intersecta con la lista visible al operar, para no eliminar productos que el filtro oculta.
- Estilos del diálogo: el fondo (`::backdrop`) usa `rgb(0 40 72 / 0.55)`, el mismo azul de las sombras de `globals.css`, porque no existe un token de overlay.

## Pedidos al tech-lead
1. firebase-architect debe agregar a los contratos (v1.2) `deleteProducts` / `restoreProducts`, `deletedAt`/`deletedBy`, el código `PRODUCT_DELETED` y las reglas de `products` (ocultar eliminados al público). Nombres y formas de esta demo son una propuesta.
2. Hoy `setProductActive` y los bloqueos con `PRODUCT_DELETED` (editar o publicar un eliminado) son solo demo; en producción deben vivir en las funciones.

## Verificación ejecutada
- `npm run lint`: sin errores. `npm test`: 17 archivos, 195 tests en verde (24 nuevos). `npx tsc --noEmit`: limpio.
- `npm run build`: OK; las rutas `/admin/*` siguen dinámicas.
- Antes del build respaldé `.next` y lo restauré después, para no alterar la app de Carlos (puerto 3000, PID 14120), que siguió respondiendo 200. Mis pruebas usaron `next start -p 3491` (cerrado al terminar).
- `/admin/productos` responde 200.
- Flujo en Edge headless por CDP (consola sin errores ni advertencias):
  - Casillas y labels; seleccionar 2 y encabezado indeterminado.
  - Diálogo modal con foco dentro; Escape lo cierra y el foco vuelve al botón; la selección se mantiene.
  - Eliminar los 2 (mensaje con conteo, selección limpia, 31 filas); filtro Eliminados; seleccionar todos y Restaurar; vuelven sin publicar (filtro "Sin publicar").
  - Seleccionar todos (33): "y 23 más"; Confirmar deshabilitado, "eliminar" en minúsculas no lo habilita, `ELIMINAR` sí; los 33 quedan en Eliminados.
  - Ficha de un eliminado con aviso y Restaurar; Descuentos ofrece solo el restaurado; Resumen y detalle de un pedido cargan.

## Prueba manual (paso a paso)
Desde la raíz: `npm run build` y `npx next start -p <puerto libre>` (no `next dev`). Abre `/admin/productos`, entra con cualquier correo.
1. Marca 2 filas: aparece "2 seleccionados" con "Eliminar seleccionados" y "Limpiar selección". La casilla del encabezado queda indeterminada.
2. Pulsa Eliminar: el diálogo lista los 2 nombres. Escape lo cierra y el foco vuelve al botón. Ábrelo de nuevo y confirma: mensaje "2 productos eliminados (simulado)" y las filas desaparecen.
3. Estado > Eliminados: ves los 2 con su fecha. Marca el encabezado y pulsa "Restaurar seleccionados": vuelven sin publicar.
4. Estado > Todos, marca el encabezado (todos) y pulsa Eliminar: aparece "y 23 más" y Confirmar está deshabilitado hasta escribir `ELIMINAR`.
5. Con los eliminados, ve a Importar > SKU + PRECIO con un SKU eliminado: sale como `PRODUCT_DELETED` y no cambia nada. Descuentos no los ofrece.
6. Abre la ficha de un eliminado: aviso "Producto eliminado" y botón Restaurar.
7. Recarga: todo vuelve al estado inicial.

## Sin verificar
- Lector de pantalla (el anuncio de `aria-live` de la barra y el diálogo), axe/Lighthouse y contraste medido: solo por estructura y tokens.
- 360 y 768 px: no probé el diseño ni el desborde de la tabla con la columna nueva (la tabla ya tiene scroll horizontal). La barra de selección y el diálogo no se revisaron visualmente.
- Safari y Firefox (se probó solo Edge/Chromium); `<dialog>` modal es estándar en ambos.
- El límite de 200 se prueba en tests del servicio; en la interfaz no hay 200 productos para verlo.
- Importar un Excel con `PRODUCT_DELETED` desde la interfaz: cubierto por tests de las tres importaciones y por el flujo de servicio, no con un archivo real.
