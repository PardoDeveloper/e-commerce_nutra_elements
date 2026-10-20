# B1 — Funciones de pedidos, pagos y métricas (firebase-architect)

Proyecto Nutra Elements (Stack B). Repo en la raíz del workspace, Node 24. Responde en español. Código en inglés, comentarios en español. **Repo público: ningún secreto ni dato del negocio en archivos versionados.**

## Contexto y decisiones
Lee en docs/team/DECISIONS.md: D-005, D-006, D-007, D-024, D-025, D-026, D-027, D-029, **D-030 y D-031**. Contratos (v1.2, fuente de verdad): docs/team/contracts/functions.md y data-model.md. Tus handoffs previos: docs/team/handoffs/2026-10-14-firebase-architect-2b1-estructura.md y 2b3-common.md, y el módulo `functions/src/common/` (errores, auth, RUT, precios, esquemas y métricas ya hechos y con tests).

El proyecto de trabajo es `nutraelements` (Blaze, Firestore us-east4). **No despliegues nada** (cada despliegue lo confirma Carlos). Tampoco emuladores ni Java (D-026): el código debe ser verificable con tests unitarios y con build y lint.

## Qué construir (functions/src/orders, payments y metrics)
Funciones del contrato, secciones 3 y 4: `createOrder`, `getOrderStatus`, `createFlowPayment`, `flowConfirm`, `confirmTransferPayment`, `resolvePaymentReview`, `cancelOrder`, `updateFulfillment`, `recordManualRefund` (regla D-025) y `releaseExpiredReservations`. Las métricas se actualizan en la misma transacción, usando `common/metrics.ts`.

Reglas de diseño:
- **Separa la lógica en funciones puras** (decidir transiciones, calcular el delta de stock y métricas, armar el snapshot) y una capa fina de transacciones de Firestore. Testea la lógica pura a fondo.
- Para la capa transaccional, escribe tests con un **doble en memoria** de la parte de Firestore que uses (`runTransaction`, `get`, `set`, `update` y `FieldValue.increment`), y di con honestidad qué cubre y qué no. Las pruebas de concurrencia real (sin sobreventa, contador sin duplicados) **quedan sin ejecutar**, y las escribes como tests marcados para la nube.
- Todo error con el formato del contrato. Los callables públicos usan `callableSecurityOptions()`. Nunca registres RUT, correo ni teléfono en los logs.
- **Flow (sandbox):** **verifica la API actual contra la documentación oficial de Flow** (flow.cl/docs/api.html). Debes confirmar los endpoints `payment/create` y `payment/getStatus`, la firma HMAC-SHA256 con los parámetros ordenados alfabéticamente, y el flujo de retorno y confirmación. No uses memoria: cita la fuente en el handoff. Credenciales con `defineSecret('FLOW_API_KEY')` y `defineSecret('FLOW_SECRET_KEY')`, y base URL de sandbox por variable (`FLOW_API_BASE`). `flowConfirm` es idempotente y valida con `getStatus` firmado (monto, moneda y número de pedido). Testea con un cliente de Flow simulado e inyectable.
- `releaseExpiredReservations`: programada cada 5 minutos, sin pisar pedidos pagados.

## Archivos que te pertenecen (hay otro agente en paralelo, B2)
- Tuyos: `functions/src/orders/**`, `functions/src/payments/**` y `functions/src/metrics/**`. Puedes **leer** `common/`, y solo hacer cambios mínimos y aditivos allí, si hace falta (reportarlos).
- **NO toques** `functions/src/catalog/**`, `admin/**` ni `triggers/**` (de B2), `functions/src/index.ts` (lo conecta el tech-lead), ni `package.json` salvo una dependencia imprescindible (justifícala), reglas, contratos, `src/` de Next.js, `.env*`.
- Cada carpeta tuya expone un `index.ts` (barrel) con sus funciones exportadas.

## Terminado cuando
- En `functions/`: `npm run build`, `npm run lint` y `npm test` en verde (pega el conteo).
- Handoff en docs/team/handoffs/2026-10-19-firebase-architect-b1-orders-payments.md, con:
  - Las funciones y sus archivos.
  - La API de Flow verificada (con la fuente).
  - Qué cubren los tests y qué **no se pudo verificar** (concurrencia, transacciones reales, Flow real).
  - Los secretos y variables que hay que cargar, **solo los nombres**.
  - Las inconsistencias del contrato, si las hay.
