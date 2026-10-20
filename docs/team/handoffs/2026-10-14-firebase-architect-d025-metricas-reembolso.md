# Handoff firebase-architect — D-025: métricas del reembolso (contratos v1.1)

Fecha: 2026-10-14. Tarea solo de documentación; no se tocó código, ni Firebase, ni git.

## Qué cambié
Ambos contratos pasan a **v1.1 — D-025 aplicada (2026-10-14)** (encabezado).

### docs/team/contracts/functions.md
- 4.6 `recordManualRefund`, paso 4 "Métricas": reescrito con la regla D-025 (diario: `revenue -= amount`, `refundsCount += 1`, `refundedAmount += amount`, `ordersCount` y `merchandise` intactos, `unitsSold -= Σqty` solo si `restocked`; por SKU: `unitsSold` y `revenue` solo si `restocked`; usa `restocked`, no `restock`; ticket = revenue / ordersCount).
- Línea "Un reembolso parcial…": ya no dice que resta el pedido completo; remite al paso 4.
- Sección 6 "Métricas": "resta el pedido completo" sustituido por la regla D-025.
- Tests 9b: (a) y (b) reescritos con la nueva regla; agregados (a2) parcial con restock true, (b2) parcial con restock false (caso pedido), (b3) asiento en el día de `paidAt` aunque `refundedAt` sea otro día, (b4) restock true con stockState distinto de committed; (c) ahora dice "un solo ajuste de métricas".
- Tabla P5: "métricas restadas" ajustado.

### docs/team/contracts/data-model.md
- 2.6 `metrics`: párrafo inicial reescrito; `metrics/daily/days` con `refundsCount` y `refundedAmount` (int, inicio 0, solo servidor) y aclaraciones en `ordersCount`, `revenue` (neto), `merchandise` (bruta), `unitsSold`; `metrics/products/items.revenue` aclarado; consultas del panel: ticket promedio neto y reembolsos del rango (`Σ refundsCount`, `Σ refundedAmount`); línea "Reembolsos" reescrita; ejemplo JSON con los dos campos nuevos.
- Resumen de P5 (fila 5 de la tabla de resoluciones) ajustado.

## Decisiones mías
- `refundsCount` y `refundedAmount` se asientan en el día de `paidAt` (igual que `revenue`), no en el de `refundedAt`, para que el neto del día sea coherente. Es una consecuencia de la regla D-025, no un cambio de ella.
- Documentos diarios previos sin los campos nuevos: el cliente los lee con 0 por defecto (el `increment` los crea).
- Ticket con `Σ ordersCount == 0`: mostrar 0 o "—".

## Inconsistencias / notas (no corregidas)
- **Test (b4) no alcanzable tal cual:** un pedido `paid` siempre tiene `stockState == committed` en el modelo actual, así que "restock true con stockState distinto de committed" no se puede construir por flujo normal. Solo se probaría sembrando el documento directamente en el emulador (Admin SDK, saltándose las funciones). Queda en el contrato como caso de defensa; el implementador decide si lo siembra o lo descarta. Lo que sí es verificable por flujo: restock false => restocked false => unidades intactas (b, b2).
- Consecuencia a conocer: el `revenue` por SKU es de mercadería y no incluye envío; solo baja con reposición, así que la suma por SKU no cuadra con el `revenue` diario (que incluye envío y reembolsos sin reposición). Está anotado en data-model 2.6.
- Con un reembolso sin reposición, `revenue` por SKU y `unitsSold` por SKU siguen contando la venta ("más vendidos" no baja). Es lo que pide D-025.

## Qué necesita nextjs-frontend
- Panel de métricas: mostrar por día/rango "Reembolsos" (`Σ refundsCount`) y "Monto reembolsado" (`Σ refundedAmount`), leídos de los mismos documentos diarios.
- Ingresos = `Σ revenue` (ya neto). Ticket promedio = `Σ revenue / Σ ordersCount`, protegiendo la división por 0.
- Leer `refundsCount`/`refundedAmount` con valor por defecto 0 (documentos antiguos).
- "Mercadería" (`merchandise`) es bruta: no rotularla como neta.

## Para tech-lead
- Las reglas de Firestore de `metrics` siguen siendo solo-lectura admin / escritura solo servidor; los campos nuevos no requieren cambios, pero cuando se escriba `firestore.rules` (2B) hay que incluir `refundsCount` y `refundedAmount` en cualquier validación de forma.
- Los tests de reglas/funciones de 2B deben cubrir 9b (a, a2, b, b2, b3).
