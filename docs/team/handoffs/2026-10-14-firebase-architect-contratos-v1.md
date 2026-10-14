# Handoff: contratos v1 (firebase-architect, 2026-10-14)

Archivos: `contracts/data-model.md` y `contracts/functions.md`, ahora **v1 — APROBADO por tech-lead el 2026-10-14 (D-024)**. Solo documentos; sin código ni cambios en Firebase.

## Cambios
- Categorías D-023: tabla de las seis categorías iniciales (2.2). Ejemplo de 2.1 corregido: SKU 2427831, Citrato de Magnesio x 120 caps, `magnesio`, precio 10990, barcode ficticio `7800000000009`.
- P3: primer pedido NE-000001. P8: 2 MiB y WebP en el navegador (lado largo <= 1600 px).
- P9: `updateFulfillment` retrocede de a un paso, solo admin, con `reason` obligatorio (`REASON_REQUIRED`); tabla 6.2 y respuesta con `direction`.
- P11: envío gratis con `>=` sobre el subtotal con descuentos. P12: correo y contraseña, sin auto-registro, MFA después.
- P13: la reimportación pisa precio y stock, no toca contenido ni descuentos (salvo `DISCOUNT_REMOVED`).
- Stock vacío: `EMPTY_STOCK` (fila inválida) en `importStock` y en filas existentes; la creación inicial en `importCatalog` sigue D-018 (vacío o negativo a 0, reportado).
- P5: estado `refunded` (terminal, "Reembolsado"), campo `refund {}`, matriz de transiciones de pago, función `recordManualRefund` (4.6) con errores, idempotencia, reposición condicional de stock y resta de métricas, y tests (9b). Sin índices nuevos.
- P6: `customer.rut` obligatorio, módulo 11 en `createOrder` (`INVALID_RUT`), normalizado, fuera de `getOrderStatus` y de los logs. Sin razón social ni giro.
- Límites anti-abuso: `settings/private.limits` con valores iniciales configurables.
- Renombrado `history` a `statusHistory` (máx. 50 entradas) en ambos archivos.
- Preguntas abiertas: solo P2 y P7; el resto, en "Resueltas".

## Decisiones mías para que el tech-lead confirme
1. En `importCatalog`, una fila de producto **ya existente** con stock vacío es `EMPTY_STOCK` (D-018 aplica solo al crear). Es mi lectura de D-024 y de P13.
2. `recordManualRefund` acepta `amount` 1..total; un reembolso parcial igual resta el pedido completo de las métricas (en el día de su `paidAt`).
3. Un pedido `refunded` con `restock: true` pasa `stockState` a `released`; con `false` queda `committed`.

## Para otros agentes
- nextjs-frontend: campo RUT obligatorio, etiqueta "Reembolsado", formulario de reembolso, motivo al retroceder el estado logístico, compresión de imágenes.
- Pendiente de verificar al implementar: desactivar el auto-registro sin Identity Platform y la API de Flow.
