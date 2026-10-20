# PLAN — Nutra Elements

Estados: pendiente · en curso · en revisión · hecha · bloqueada
Requisitos de negocio: [DESCUBRIMIENTO.md](DESCUBRIMIENTO.md) · Decisiones: [DECISIONS.md](DECISIONS.md)

> **Estado general (2026-10-14):** Fases 0, 1 y 2A terminadas: MVP aprobado (D-015) y contratos v1.1 (D-023, D-024 y D-025). **El plan detallado de la Fase 2B espera la aprobación de Carlos.** Aún no hay código.

---

## Fase 0 — Preparación del proyecto

| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 0.1 | Revisar coherencia de CLAUDE.md y AGENTS.md con el Stack B | tech-lead | Observaciones entregadas | — | hecha |
| 0.2 | Crear docs/team | tech-lead | Estructura creada | — | hecha |
| 0.3 | git init (main y develop) y .gitignore | devops | Verificado por el tech-lead | 0.2 | hecha |
| 0.4 | Proyectos/nutra-elements/ en la bóveda | organizador | Verificado por el tech-lead | — | hecha |
| 0.5a | firebase-tools global con sesión iniciada | Carlos | `firebase login:list` OK | — | hecha |
| 0.5b | gh con sesión iniciada | Carlos | `gh auth status` OK (PardoDeveloper) | — | hecha |
| 0.6 | Blaze en `nutraelements` (hecho) y alerta de 20 USD (creada); dev = `nutraelementsdev` en Spark (D-009, D-021) | Carlos | Blaze activo, alerta creada y D-021 resuelta | — | hecha (dev en Spark por decisión de Carlos, D-021) |
| 0.7 | `.firebaserc` (default/dev → nutraelementsdev, prod → nutraelements), `.gitattributes` (D-003), ignorar .xls/.xlsx/.csv (D-017) | devops | Commiteado en develop | — | hecha |
| 0.8 | Remoto `PardoDeveloper/e-commerce_nutra_elements` y push de main y develop | devops | Ramas visibles en GitHub | 0.7 | hecha |
| 0.9 | Verificar la región de App Hosting y fijar la región definitiva (D-010) | firebase-architect | Región confirmada con evidencia | 0.6 | hecha (us-east4, D-010) |
| 0.9b | Aislamiento dentro de un solo proyecto (D-019) | firebase-architect | — | — | descartada (hay dos proyectos) |

| 0.10 | Actualizar AGENTS.md: pagos con Flow, un solo proyecto, valoraciones solo con reseñas reales | tech-lead | Carlos aprueba el cambio | — | hecha |
| 0.11 | Dar al organizador permiso para mover archivos | Carlos | `organizador.md` con Bash y la regla de solo mover | — | hecha (Carlos le dio el permiso) |

## Fase 1 — Descubrimiento (sin código)

| # | Tarea | Dueño | Terminado cuando | Estado |
|---|-------|-------|------------------|--------|
| 1.1 | Preguntas de negocio | tech-lead | Respuestas en DESCUBRIMIENTO.md | hecha |
| 1.2 | Alcance del MVP | tech-lead | Aprobado por Carlos | hecha (D-015) |
| 1.3 | Firestore o Data Connect | firebase-architect | handoffs/2026-10-14-firebase-architect-recomendacion-datos.md | hecha |
| 1.4 | Palabras clave y prioridades SEO | seo-specialist | contracts/seo/00-palabras-clave-y-prioridades.md (borrador) | hecha |
| 1.5 | Plan del MVP por fases | tech-lead | Este archivo, aprobado por Carlos | hecha (D-015) |

---

## Alcance del MVP (aprobado por Carlos, D-015)

**Entra en el MVP**
- Tienda pública con SEO desde el día uno: /, /productos, /categorias/[slug], /productos/[slug], /nosotros, /contacto, /preguntas-frecuentes y las páginas legales (términos, privacidad, cambios y devoluciones).
- Carrito y checkout como invitado. Despacho solo en la RM (comuna validada, $3.990) o retiro en tienda. Envío gratis sobre un monto configurable.
- Pago con Flow (sandbox en dev) y con transferencia (pedido pendiente hasta que el admin lo confirme).
- Precio, descuentos y totales calculados siempre en el servidor. Stock reservado al crear el pedido.
- Número de pedido NE-000123, con el aviso de seguimiento por DispatchTrack.
- ~~Correos~~: el MVP no envía correos (D-008). El número de pedido se muestra en la confirmación.
- Admin (un solo rol):
  - Login, y CRUD de productos con imágenes.
  - Importación inicial desde la planilla.
  - Excel con SKU y PRECIO, y con SKU y STOCK.
  - Descuento por producto y masivo (porcentaje o monto fijo).
  - Pedidos con sus estados y confirmación de transferencias.
  - Métricas: más vendidos, ticket promedio y productos sin stock.
  - Ajustes: envío gratis, dirección y horario de la tienda, datos bancarios.

**Queda para después del lanzamiento (Fase 3)**
- Cuentas de cliente con perfil e historial de pedidos.
- Blog con editor en el admin.
- Reseñas reales y su aggregateRating.
- Integración con DispatchTrack por API.
- Boleta y factura automáticas con Control Farma.
- Cupones.

---

## Fase 2 — Construcción del MVP (la 2B no empieza sin la aprobación de Carlos)

Orden de dependencias: contratos → firebase-architect → nextjs-frontend → seo-specialist (auditoría) → qa-reviewer → devops.

### 2A · Contratos (bloquean todo lo demás)
| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 2A.1 | Contrato del modelo de datos de Firestore | firebase-architect → tech-lead aprueba | contracts/data-model.md aprobado | — | hecha (v1.1, D-024 y D-025) |
| 2A.2 | Contrato de las Cloud Functions | firebase-architect → tech-lead aprueba | contracts/functions.md aprobado | 2A.1 | hecha (v1.1, D-024 y D-025) |
| 2A.3 | Requisitos SEO por página | seo-specialist | contracts/seo/00 a 06 | 2A.1 | hecha (aprobada por el tech-lead, D-023) |

### 2B · Backend en Firebase — aprobada por Carlos el 2026-10-14, con D-026
Sin emuladores por ahora (D-026): build, lint y tests unitarios. Los tests de reglas y de emulador se escriben y quedan **sin ejecutar**. Nada se despliega a la nube.

| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 2B.0 | Instalar Java (JDK) y levantar los emuladores | Carlos | `java -version` OK y autorización de Carlos | — | pospuesta (D-026); bloquea solo la ejecución de los tests de reglas y de emulador |
| 2B.1 | `firebase.json` (config de emuladores, reglas e índices), `/functions` en TS con Node 24, lint, tests unitarios y scripts `test:rules`/`test:emulator` (sin ejecutar); `.gitignore` de `functions/.secret.local` y `functions/.env*` | firebase-architect | build, lint y test unitario en verde, **sin levantar emuladores** | — | hecha (verificada por el tech-lead; emuladores sin probar, D-026) |
| 2B.2 | `firestore.rules`, `storage.rules` e índices según data-model.md, con tests de reglas (orders, counters, products, metrics, admin, imágenes de 2 MiB) | firebase-architect | Tests de reglas en verde; ninguna colección abierta | 2B.1 | hecha (tests de reglas escritos, SIN ejecutar por D-026; D-027) |
| 2B.3 | Módulo común: validación (zod), errores del contrato, `assertAdmin`, App Check, RUT módulo 11, cálculo de precios, descuentos y envío | firebase-architect | Tests unitarios en verde | 2B.1 | hecha (193 tests unitarios en verde, verificado por el tech-lead) |
| 2B.4 | `createOrder` y `getOrderStatus`: transacción con precios del servidor, reserva de stock, NE-000001, idempotencia y límites anti-abuso | firebase-architect | Tests de concurrencia (sin sobreventa ni números duplicados) y de manipulación de precio en verde | 2B.2, 2B.3 | pendiente |
| 2B.5 | Gestión de pedidos: `confirmTransferPayment`, `resolvePaymentReview`, `cancelOrder`, `updateFulfillment`, `recordManualRefund` (D-025), `releaseExpiredReservations` y métricas (D-012) | firebase-architect | Matriz de transiciones (tests 9 y 9b) y métricas correctas en verde | 2B.4 | pendiente |
| 2B.6 | Catálogo y admin: `importCatalog`, `importPrices`, `importStock`, `applyDiscount`, `setProductsPublished`, `createProduct`, `updateProductCommerce`, `grantAdmin`/`revokeAdmin`, `deleteProducts`/`restoreProducts` (D-029; `deletedAt: null` al crear) y script para el primer admin en el emulador | firebase-architect | Tests en verde con la planilla real en local (sin versionarla) y reporte de filas inválidas | 2B.3 | pendiente |
| 2B.7 | Triggers de revalidación ISR (`onProductWritten`, `onCategoryWritten`, `onSettingsPublicWritten`) con un secreto compartido | firebase-architect | Tests en verde (la ruta de Next.js llega en 2C) | 2B.6 | pendiente |
| 2B.8 | Flow: `createFlowPayment` y `flowConfirm` con `getStatus` firmado, contra un mock | firebase-architect | Tests de idempotencia (test 6) en verde con el mock | 2B.4, 2B.5 | pendiente |
| 2B.8b | Flow de punta a punta en sandbox con túnel | firebase-architect | Pago real en sandbox | 2B.8; túnel y emuladores autorizados por Carlos | pendiente a futuro (D-026) |
| 2B.9 | Revisión de QA del backend (reglas, dinero, secretos y repo público) y commit a develop | qa-reviewer → devops | APROBADO y push a develop | 2B.2 a 2B.8 | pendiente |

Paralelo posible: 2B.4/2B.5 y 2B.6/2B.7 tocan archivos distintos de /functions, y 2C.1 (esqueleto de Next.js) puede empezar junto con la 2B.1.

### 2C · Frontend en Next.js
| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 2C.1 | Proyecto Next.js (App Router, TS estricto), layout y clientes de Firebase | nextjs-frontend | `npm run build` y lint en verde | 0.7 | hecha (build, lint y 5 tests en verde, verificado por el tech-lead) |
| 2C.2 | Páginas públicas con el SEO técnico | nextjs-frontend | Cumple contracts/seo | 2A.3, 2B.2 | pendiente |
| 2C.3 | Carrito, checkout y página de confirmación | nextjs-frontend | Compra end-to-end en los emuladores | 2B.3, 2B.4 | pendiente |
| 2C.4 | Admin: productos e imágenes, Excel, descuentos, pedidos, métricas y ajustes | nextjs-frontend | Flujos probados en los emuladores | 2B.7, 2B.8 | pendiente |


### Prototipo para la demo (D-028) — 2026-10-15
| # | Tarea | Dueño | Estado |
|---|-------|-------|--------|
| P1 | Marca, layout, componentes, capa de datos y carrito | nextjs-frontend | hecha (verificada) |
| P2 | Tienda pública con SEO | nextjs-frontend | hecha (verificada: build y curl) |
| P3 | Carrito, checkout simulado y confirmación | nextjs-frontend | hecha (verificada: build y curl) |
| P4 | Admin en modo demostración | nextjs-frontend | hecha (verificada: build y curl) |

Antes de producción: quitar `DEMO_MODE`, el login simulado y `DEMO_FREE_SHIPPING_THRESHOLD`; unificar `rut.ts`; `X-Robots-Tag` fijo para `/admin`; grupos de rutas `(tienda)`/`(admin)`; QA y auditoría SEO.


### Producción como backend real (D-031) — 2026-10-19
| # | Tarea | Dueño | Depende de | Estado |
|---|-------|-------|------------|--------|
| PR.1 | Infra prod: Firestore y Storage en us-east4, Auth (correo y Google), app web y `.env.local` de prod | devops (+ Carlos en consola) | — | en curso |
| PR.2 | Revisión estática de reglas e índices para prod | qa-reviewer | — | en curso |
| PR.3 | 2B.6 funciones del catálogo (con delete/restore) | firebase-architect | — | en curso |
| PR.4 | claimAdmin/grantAdmin/revokeAdmin y triggers ISR | firebase-architect | — | en curso |
| PR.5 | Desplegar reglas e índices en prod | devops | PR.1, PR.2 APROBADO | pendiente |
| PR.6 | Frontend con Firebase real (catálogo Firestore, login correo y Google, admin con callables y Storage, `/api/revalidate`); quitar el modo demo | nextjs-frontend | D-030 terminado, PR.3, PR.4 | pendiente |
| PR.7 | QA completo, commit y push, deploy de functions y backend de App Hosting (noindex), con plan de rollback | qa-reviewer → devops | PR.5, PR.6 | pendiente |
| PR.7b | Checklist de lanzamiento: datos bancarios reales (no "BANCO DE PRUEBA"), Flow de producción, `SITE_INDEXABLE=true`, dominio, `test:rules` con Java, textos legales y regulatorios revisados | Carlos + tech-lead | antes del lanzamiento | pendiente |
| PR.8 | Compras: 2B.4, 2B.5 y 2B.8 con Flow sandbox en prod; incluye el campo público `transferEnabled` en `settings/public`, escrito por el servidor cuando hay un banco real (hoy la transferencia queda oculta con firebase) | firebase-architect → nextjs-frontend | PR.7 | pendiente |

### 2D · Calidad y despliegue
| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 2D.1 | Auditoría SEO | seo-specialist | APROBADO | 2C.2 | pendiente |
| 2D.2 | Revisión de QA (reglas, Flow, precios, secretos) | qa-reviewer | APROBADO | 2D.1 | pendiente |
| 2D.3 | Despliegue a dev (App Hosting desde develop) y prueba de humo | devops | URL de dev funcionando; compra en sandbox | 2D.2, 0.8 | pendiente |
| 2D.4 | Producción: credenciales de Flow de producción, dominio nutraelements.cl, Search Console | devops + Carlos | **Confirmación explícita de Carlos y plan de rollback** | 2D.3 | pendiente |

### Riesgos del plazo (entrega "la próxima semana")
- Es muy ajustado. El camino crítico depende de Carlos: planilla, Blaze, DNS, gh y, para producción, la cuenta de Flow productiva.
- Propuesta: en la semana 1, tener el MVP completo en **dev** con Flow sandbox. Producción, cuando estén las credenciales de Flow de producción y el DNS.

## Fase 3 — Después del lanzamiento
Cuentas de cliente e historial · Blog · Reseñas y aggregateRating · DispatchTrack por API · Control Farma por API · Cupones · Revisión profesional de los textos según el Reglamento Sanitario.
