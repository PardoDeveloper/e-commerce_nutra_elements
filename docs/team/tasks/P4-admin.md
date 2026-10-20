# P4 — Admin en "Modo demostración" (nextjs-frontend)

Lee primero `_comun-prototipo.md`. Del contrato, lee functions.md secciones 4 (pedidos, `updateFulfillment`, `recordManualRefund`) y 5 (catálogo, imports, descuentos, publicar, crear y editar), y en data-model.md las secciones `orders` 6.1/6.2, `metrics` 2.6 y `settings`. De DECISIONS.md, además: D-011, D-012, D-016 y D-018.

Todo es dinámico y con **noindex**.
1. `/admin/login`: correo y contraseña. Cualquier entrada ingresa y queda en sessionStorage. Lleva el rótulo "Modo demostración: sin autenticación real".
2. **Layout:** barra lateral (Resumen, Productos, Importar Excel, Descuentos, Pedidos, Ajustes), banner fijo "Modo demostración: los cambios no se guardan" y botón para salir. Responsive.
3. `/admin` (métricas):
   - Tarjetas: ventas, pedidos, ticket promedio (neto / pedidos), reembolsos y monto reembolsado.
   - Gráfico por día en SVG o CSS, **sin librerías**.
   - Top 10 de más vendidos y lista de productos sin stock.
   - Rango de 7, 30 o 90 días.
   - Datos deterministas, sin `Math.random` en cada render.
4. **Productos:**
   - Tabla con búsqueda y filtros.
   - Edición de contenido y de comercio, por separado.
   - Imágenes: subir con vista previa y **compresión a WebP en el navegador (lado largo ≤ 1600 px, ≤ 2 MiB, con canvas)**; reordenar y quitar.
   - Publicar y despublicar, y "Nuevo producto". Los productos no se borran, se desactivan.
5. **Importar Excel**, con pestañas para la planilla de Control Farma, SKU + PRECIO y SKU + STOCK:
   - Parseo en el navegador con SheetJS. Puedes mover `xlsx` de devDependencies a `dependencies` sin cambiar la versión ni la fuente (es el ÚNICO cambio permitido en package.json). Impórtalo con `import()` dinámico.
   - Vista previa con filas válidas, filas inválidas con motivo (SKU inexistente, precio no entero, stock vacío = `EMPTY_STOCK`) y los cambios antes → después.
   - Botón "Aplicar (simulado)".
6. **Descuentos:** por producto o masivo (selección, categoría o lista de SKU), con porcentaje o monto fijo, vista previa y quitar.
7. **Pedidos:**
   - Lista con filtros por estado; etiquetas en español, incluida "Reembolsado".
   - Detalle con cliente (con RUT), ítems, totales, entrega y `statusHistory`.
   - Acciones según la matriz: confirmar transferencia; avanzar el estado logístico; retroceder un paso con **motivo obligatorio**; cancelar (solo `pending_payment`); **registrar reembolso manual** (monto, medio, fecha, nota y casilla "reponer stock").
   - Solo se muestran las acciones permitidas para cada estado.
8. **Ajustes:** umbral de envío gratis (vacío = desactivado), costo de despacho en la RM, dirección y horario, datos bancarios de prueba, y minutos u horas de reserva.
- La simulación va en `src/lib/admin/` detrás de una interfaz calcada del contrato, con una constante `DEMO_MODE` y un comentario de que el login simulado NO puede llegar a producción (D-028).
- No copies datos del .xls a archivos versionados. Úsalo solo como prueba manual.

## Tus archivos
`src/app/admin/**`, `src/components/admin/**`, `src/lib/admin/**`, y el movimiento de `xlsx` en package.json y en el lockfile.

## Terminado cuando
- Lint, test (transiciones, validación de filas del Excel y lo que se pueda de la compresión) y build en verde.
- curl devuelve 200 con noindex en `/admin/login` y `/admin`, y robots.txt sigue bloqueando `/admin/`.
- Handoff: docs/team/handoffs/2026-10-15-nextjs-frontend-p4-admin.md, con la interfaz simulada, **un paso a paso para probar a mano** y lo que quedó sin verificar.
