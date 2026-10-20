# P3 — Carrito, checkout y confirmación (nextjs-frontend)

Lee primero `_comun-prototipo.md`, después functions.md 3.1 (`createOrder`) y 3.4 (`getOrderStatus`), y en data-model.md las secciones `settings` y `orders`. Ya existen `src/lib/rut.ts` con su test y `src/lib/checkout/types.ts` de un intento anterior: revísalos.

Todo es dinámico y con **noindex**.
1. `/carrito`:
   - Líneas con imagen, nombre, precio, cantidad, quitar y subtotal.
   - Resumen con subtotal y descuentos, y la nota "envío en el checkout".
   - Estado vacío y botón "Ir a pagar".
   - El carrito guarda solo `{sku, qty}`; los precios vienen de `@/lib/data` (tú decides cómo llegan al cliente).
2. `/checkout`, en una sola página:
   - **Datos:** nombre, correo, teléfono y **RUT obligatorio** (módulo 11, normalizado a `12345678-K`, igual que `functions/src/common/rut.ts`; anota en el handoff que hay que unificarlos).
   - **Entrega:** despacho en la RM con comuna y dirección ($3.990), o retiro en Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00 (gratis).
   - **Envío gratis:** si el subtotal con descuentos es `>=` al umbral; sin umbral, no hay envío gratis.
   - **Pago:** Flow o transferencia.
   - **Resumen:** con la nota "el total final lo confirma el servidor" (D-005).
   - Errores accesibles por campo, `autocomplete` y `inputmode` correctos.
   - **Al enviar (simulado):**
     - Se genera un número NE-000001, incremental en localStorage, y se vacía el carrito.
     - Con **Flow**, aparece una pantalla "Redirigiendo a Flow (simulado)" con los botones "Simular pago aprobado" y "Simular pago rechazado".
     - Con **transferencia**, se muestran datos bancarios **de prueba** y la reserva de 48 h.
3. `/pedido/[numero]`:
   - El número NE-xxxxxx bien destacado, con la indicación de guardarlo y de usarlo para el seguimiento en DispatchTrack (no hay correos).
   - El estado del pago (con reintento si fue rechazado), el resumen y la entrega.
   - **Sin el RUT.**
4. Banner "Prototipo: los pagos son simulados".
- La simulación va en `src/lib/checkout/` detrás de una interfaz igual a la del contrato (`createOrder`, `createFlowPayment`, `getOrderStatus`).

## Tus archivos
`src/app/{carrito,checkout,pedido}/**`, `src/components/checkout/**`, `src/lib/checkout/**` y `src/lib/rut*.ts`.

## Terminado cuando
- Lint, test (con el RUT y el cálculo del resumen) y build en verde.
- curl devuelve 200 con noindex en `/carrito` y `/checkout`.
- Handoff: docs/team/handoffs/2026-10-15-nextjs-frontend-p3-checkout.md, con la interfaz simulada, **un paso a paso para probar a mano** (Flow aprobado y rechazado, transferencia, retiro, despacho, RUT inválido, envío gratis) y lo que quedó sin verificar.
