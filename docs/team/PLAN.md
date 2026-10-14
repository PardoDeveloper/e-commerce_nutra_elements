# PLAN — Nutra Elements

Estados: pendiente · en curso · en revisión · hecha · bloqueada
Requisitos de negocio: [DESCUBRIMIENTO.md](DESCUBRIMIENTO.md) · Decisiones: [DECISIONS.md](DECISIONS.md)

> **Estado general (2026-10-14):** Fase 0 casi terminada y Fase 1 terminada. **El plan del MVP espera la aprobación de Carlos.** No se construye ninguna funcionalidad hasta tenerla.

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
| 0.6 | Blaze en `nutraelements` (hecho) y alerta de 20 USD (por confirmar); dev = `nutraelementsdev` en Spark (D-009, D-021) | Carlos | Blaze activo, alerta creada y D-021 resuelta | — | en curso |
| 0.7 | `.firebaserc` (default/dev → nutraelementsdev, prod → nutraelements), `.gitattributes` (D-003), ignorar .xls/.xlsx/.csv (D-017) | devops | Commiteado en develop | — | pendiente |
| 0.8 | Remoto `PardoDeveloper/e-commerce_nutra_elements` y push de main y develop | devops | Ramas visibles en GitHub | 0.7 | pendiente |
| 0.9 | Verificar la región de App Hosting y fijar la región definitiva (D-010) | firebase-architect | Región confirmada con evidencia | 0.6 | pendiente |
| 0.9b | Aislamiento dentro de un solo proyecto (D-019) | firebase-architect | — | — | descartada (hay dos proyectos) |

| 0.10 | Actualizar AGENTS.md: pagos con Flow, un solo proyecto, valoraciones solo con reseñas reales | tech-lead | Carlos aprueba el cambio | — | hecha |
| 0.11 | Dar al organizador permiso para mover archivos | Carlos | `organizador.md` con Bash y la regla de solo mover | — | bloqueada (permiso denegado a ~/.claude) |

## Fase 1 — Descubrimiento (sin código)

| # | Tarea | Dueño | Terminado cuando | Estado |
|---|-------|-------|------------------|--------|
| 1.1 | Preguntas de negocio | tech-lead | Respuestas en DESCUBRIMIENTO.md | hecha |
| 1.2 | Alcance del MVP | tech-lead | Aprobado por Carlos | en revisión |
| 1.3 | Firestore o Data Connect | firebase-architect | handoffs/2026-10-14-firebase-architect-recomendacion-datos.md | hecha |
| 1.4 | Palabras clave y prioridades SEO | seo-specialist | contracts/seo/00-palabras-clave-y-prioridades.md (borrador) | hecha |
| 1.5 | Plan del MVP por fases | tech-lead | Este archivo, aprobado por Carlos | en revisión |

---

## Alcance del MVP (propuesto, falta la aprobación de Carlos)

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

## Fase 2 — Construcción del MVP (NO empezar sin aprobación)

Orden de dependencias: contratos → firebase-architect → nextjs-frontend → seo-specialist (auditoría) → qa-reviewer → devops.

### 2A · Contratos (bloquean todo lo demás)
| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 2A.1 | Contrato del modelo de datos de Firestore | firebase-architect → tech-lead aprueba | contracts/data-model.md aprobado | Planilla recibida (variantes) | pendiente |
| 2A.2 | Contrato de las Cloud Functions (entrada, salida, errores y autorización) | firebase-architect → tech-lead aprueba | contracts/functions.md aprobado | 2A.1 | pendiente |
| 2A.3 | Requisitos SEO por página | seo-specialist | contracts/seo/01..n aprobados | 2A.1 | pendiente |

### 2B · Backend en Firebase (dev)
| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 2B.1 | firebase.json, emuladores y estructura de /functions | firebase-architect | Los emuladores levantan | 0.7, 0.9 | pendiente |
| 2B.2 | Reglas de Firestore y Storage, con tests (prioridad: orders, counters, products, admin) | firebase-architect | Tests de reglas en verde | 2A.1 | pendiente |
| 2B.3 | createOrder: precios en el servidor, reserva de stock y contador NE-xxxxxx (todo en una transacción) | firebase-architect | Tests de concurrencia y de manipulación de precio en verde | 2A.2 | pendiente |
| 2B.4 | Flow: crear pago y confirmación con getStatus firmado (idempotente, valida monto, moneda y número de pedido) | firebase-architect | Pago end-to-end en sandbox | 2B.3 y secretos de Flow en Secret Manager (los carga Carlos) | pendiente |
| 2B.5 | Transferencia: confirmación por el admin; función programada que libera reservas vencidas | firebase-architect | Tests en verde | 2B.3 | pendiente |
| 2B.6 | ~~Correos~~ (fuera del MVP, D-008) | — | — | — | descartada |
| 2B.7 | Funciones del admin: importar la planilla, Excel de SKU y PRECIO, Excel de SKU y STOCK, descuento masivo, claim de admin | firebase-architect | Tests en verde, con reporte de filas inválidas | 2A.2 | pendiente |
| 2B.8 | Métricas precalculadas | firebase-architect | Valores correctos con datos de prueba | 2B.3 | pendiente |

### 2C · Frontend en Next.js
| # | Tarea | Dueño | Terminado cuando | Depende de | Estado |
|---|-------|-------|------------------|------------|--------|
| 2C.1 | Proyecto Next.js (App Router, TS estricto), layout y clientes de Firebase | nextjs-frontend | `npm run build` y lint en verde | 0.7 | pendiente |
| 2C.2 | Páginas públicas con el SEO técnico | nextjs-frontend | Cumple contracts/seo | 2A.3, 2B.2 | pendiente |
| 2C.3 | Carrito, checkout y página de confirmación | nextjs-frontend | Compra end-to-end en los emuladores | 2B.3, 2B.4 | pendiente |
| 2C.4 | Admin: productos e imágenes, Excel, descuentos, pedidos, métricas y ajustes | nextjs-frontend | Flujos probados en los emuladores | 2B.7, 2B.8 | pendiente |

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
