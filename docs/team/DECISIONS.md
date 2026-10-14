# DECISIONS — Nutra Elements

Formato: fecha · decisión · alternativas consideradas · por qué.
Estado: **vigente** (decidida) · **propuesta** (espera la aprobación de Carlos).

## D-001 · 2026-10-14 · Carpeta del proyecto — vigente
- **Decisión:** el proyecto vive en `C:\Workspace\E-Commerce NutraElements`.
- **Alternativas:** `C:\Workspace\nutra-elements-app`.
- **Por qué:** es la carpeta cuyo CLAUDE.md declara `Proyecto: nutra-elements` y `Stack: B`. Carlos confirmó que `nutra-elements-app` (Shopify) no tiene relación con este proyecto.

## D-002 · 2026-10-14 · Stack B — vigente
- **Decisión:** Next.js (App Router) + Firebase.
- **Alternativas:** Stack A (Angular + Go + PostgreSQL).
- **Por qué:** está declarado en CLAUDE.md. El SEO es central (SSR/SSG), la lógica es moderada y no hay que administrar servidores.

## D-003 · 2026-10-14 · Finales de línea LF — vigente
- **Decisión:** `.gitattributes` con `* text=auto eol=lf`.
- **Alternativas:** conversión CRLF de Windows.
- **Por qué:** App Hosting y Functions corren en Linux; así se evitan diffs ruidosos.

## D-004 · 2026-10-14 · Firestore para catálogo, pedidos, stock e inventario — vigente
- **Decisión:** Firestore. La lógica de dinero y stock vive solo en Cloud Functions de 2ª generación (TypeScript).
- **Alternativas:** Data Connect (Cloud SQL para PostgreSQL).
- **Por qué:** con 70 a 150 SKU y una bodega no se necesita un modelo relacional. Data Connect exige una instancia de Cloud SQL siempre encendida, cuyo costo estimado (sin verificar) es de 10 a 15 USD/mes, la mitad o más del presupuesto de 20 USD. Además agrega complejidad con una semana de plazo. Las transacciones de Firestore bastan para el stock y el contador.

## D-005 · 2026-10-14 · El servidor es la fuente de verdad del precio — vigente
- **Decisión:** el cliente envía solo `[{sku, qty}]`. La Function calcula los precios, los descuentos, el envío y el total, y guarda un snapshot en el pedido. La confirmación de Flow se valida con `getStatus` firmado (monto, moneda y número de pedido) y es idempotente.
- **Alternativas:** calcular el total en el cliente.
- **Por qué:** seguridad. Así nadie puede manipular el monto a pagar.

## D-006 · 2026-10-14 · Reservar stock al crear el pedido — propuesta
- **Decisión:** el stock se descuenta en la misma transacción que crea el pedido. La reserva dura 30 minutos para Flow y 48 horas para transferencia (configurable). Una función programada libera las reservas vencidas. Si un pago llega después de que la reserva expiró y ya no hay stock, el pedido pasa a `payment_review`.
- **Alternativas:** descontar solo al confirmarse el pago, lo que puede causar sobreventa.
- **Por qué:** evita vender lo que no hay. **Carlos debe confirmar las 48 horas para transferencias.**

## D-007 · 2026-10-14 · Número de pedido legible — vigente (Carlos confirma que DispatchTrack acepta el formato)
- **Decisión:** `NE-000123`, generado con `counters/orders` dentro de la transacción de creación. Es también el ID del documento y el identificador que se usa en DispatchTrack.
- **Alternativas:** el ID automático de Firestore, que no es legible.
- **Por qué:** el cliente y DispatchTrack necesitan un número simple. Falta confirmar que DispatchTrack acepte ese formato y desde qué número se parte.

## D-008 · 2026-10-14 · Sin correos en el MVP — vigente (decisión de Carlos)
- **Decisión:** el MVP no envía correos. El número de pedido NE-xxxxxx se muestra en la página de confirmación, con la indicación de guardarlo y de usarlo para el seguimiento en DispatchTrack.
- **Alternativas:** Gmail SMTP (versión anterior de esta decisión) o Resend con dominio propio.
- **Por qué:** decisión de Carlos para simplificar. Riesgo: si el cliente pierde el número, no tiene cómo recuperarlo. Se puede retomar después del lanzamiento.

## D-009 · 2026-10-14 · Dos proyectos de Firebase — vigente (decisión de Carlos, reemplaza la versión de un solo proyecto)
- **Decisión:** `dev` → `nutraelementsdev` (plan **Spark**), `prod` → `nutraelements` (plan **Blaze**). develop → dev y main → prod.
- **Alternativas:** un solo proyecto con dos pilas (D-019, ya descartada).
- **Por qué:** Carlos creó el proyecto de dev. El aislamiento es total y mucho más simple que D-019.
- **Riesgo:** en Spark no se pueden desplegar Cloud Functions ni App Hosting, no hay Secret Manager y, en proyectos nuevos, probablemente tampoco Storage. Dev queda limitado a Auth y Firestore en la nube, o al Emulator Suite local. Ver D-021.

## D-010 · 2026-10-14 · Región `us-east4` para todo — vigente (aprobada por Carlos el 2026-10-14)
- **Decisión:** App Hosting, Firestore, Functions y Storage en `us-east4`, tanto en prod como en dev. Las fichas y categorías se sirven estáticas o con ISR desde el CDN, para compensar la distancia a Chile.
- **Alternativas:** Firestore en `southamerica-west1` con App Hosting en EE. UU. (cada render SSR haría un viaje de ida y vuelta entre continentes) o `us-central1`.
- **Por qué:** según la documentación oficial, revisada por firebase-architect, App Hosting **no** soporta `southamerica-west1`. Colocar todo junto evita latencia entre servicios. Sin verificar: latencias y precios por región.

## D-011 · 2026-10-14 · Admin con un solo rol — vigente
- **Decisión:** custom claim `admin: true` en Firebase Auth. Las reglas y las Functions lo verifican.
- **Por qué:** Carlos indicó que todos los usuarios del admin son administradores.

## D-012 · 2026-10-14 · Métricas propias, sin Google Analytics — vigente
- **Decisión:** agregados precalculados (ventas por día y por SKU) con `increment`. "Sin stock" se obtiene con una consulta a `products`.
- **Por qué:** Carlos no quiere Google Analytics, y los agregados mantienen bajas las lecturas.

## D-013 · 2026-10-14 · Credenciales de Flow — vigente (actualizada)
- **Decisión:** en local, las credenciales de Flow sandbox van en `.env` en la raíz del repo; está ignorado por git y se verificó con `git check-ignore`. Plantilla: `.env.example`, sin valores. En la nube van en Secret Manager, que solo existe en Blaze (prod). Las credenciales de producción nunca van en `.env` ni en el chat.
- **Por qué:** petición de Carlos. Como el repo es público, hay que verificar en cada commit que `.env` no se suba. Carlos decidió no regenerar las credenciales de sandbox.

## D-014 · 2026-10-14 · SEO: valoraciones e indexación — vigente (AGENTS.md actualizado)
- **Decisión:**
  1. No emitir `aggregateRating` ni `review` mientras no existan reseñas reales y visibles.
  2. Usar noindex con meta robots en /carrito, /checkout, /cuenta y /admin, además de robots.txt.
  3. No indexar un /blog vacío.
- **Alternativas:** valoraciones de ejemplo, que violan las directrices de Google y arriesgan una acción manual.
- **Por qué:** cumplimiento con Google. AGENTS.md debe decir "valoraciones solo cuando existan reseñas reales".

## D-015 · 2026-10-14 · Alcance del MVP — vigente (aprobado por Carlos el 2026-10-14)
- **Decisión:** el alcance definido en PLAN.md. Las cuentas de cliente, el blog, las reseñas, DispatchTrack por API, Control Farma y los cupones quedan para la Fase 3.
- **Alternativas:** incluir las cuentas y el blog en el MVP, lo que agrega días con un plazo de una semana.
- **Por qué:** lo mínimo para empezar a vender, dentro del plazo.

## D-016 · 2026-10-14 · Identificador del producto (SKU) — vigente (confirmado por Carlos)
- **Decisión:** el SKU es la columna **ID** de la planilla de Control Farma (ej. 2427844). CODIGO_BARRA se guarda como `barcode` y solo se publica como GTIN si es válido.
- **Alternativas:** usar CODIGO_BARRA como SKU (algunos parecen ISBN, con prefijo 978, y podrían no ser reales).
- **Por qué:** el ID es único, estable y del sistema de origen, lo que facilita la futura integración con Control Farma. Carlos confirmó que el SKU es la columna ID, también en los Excel de precio y stock.

## D-017 · 2026-10-14 · Las planillas de datos no se versionan — vigente
- **Decisión:** los archivos .xls, .xlsx y .csv con datos del negocio quedan fuera de git.
- **Por qué:** el repo es público y la planilla tiene stock y datos internos.

## D-019 · 2026-10-14 · Dos pilas aisladas dentro de `nutraelements` — DESCARTADA (reemplazada por D-009, con dos proyectos)
- **Decisión:** dentro del único proyecto, cada ambiente tiene su propia pila:

  | Pieza | dev | prod |
  |---|---|---|
  | App Hosting | backend `nutra-dev` (desde develop, rollout automático) | backend `nutra-prod` (desde main, **rollout manual con confirmación de Carlos**) |
  | Firestore | base con nombre `nutra-dev` | `(default)` |
  | Storage | bucket `nutraelements-dev` | bucket por defecto |
  | Functions | codebase `dev` (prefijo `dev-`) | codebase `prod` |
  | Secretos | sufijo `_SANDBOX` | sufijo `_PROD` |

  - Auth es compartido y en el MVP solo tiene administradores. El checkout se prueba como invitado.
  - `assertEnv()` valida el ambiente al arrancar.
  - En dev, los correos salen solo a una lista blanca.
  - Las reglas son las mismas para ambas bases.
  - El trabajo diario se hace en el Emulator Suite.
- **Alternativas:** solo emulador más un backend de preview (necesita lo mismo y no es más simple), prefijos de colección en una sola base (mezcla datos y métricas) o un solo backend (no hay dev sin tocar prod).
- **Por qué:** es el aislamiento mínimo que evita que las pruebas toquen pedidos, stock o pagos reales, con un costo estimado (sin verificar) de 0 a 2 USD/mes extra.
- **Decisiones del tech-lead dentro de D-019:**
  1. Cuentas de servicio separadas por ambiente: **después del lanzamiento**. Mientras el MVP tenga solo administradores, el riesgo es aceptable; queda en la Fase 3.
  2. Los nombres `nutra-dev` (base) y `nutraelements-dev` (bucket) quedan confirmados.
  3. devops crea los recursos solo después de Blaze y de la aprobación de Carlos.
- **Sin verificar (lo prueba devops con `--dry-run` en dev):** soporte del emulador para bases con nombre, cómo se asocia cada backend de App Hosting con su `apphosting.<env>.yaml`, el rollout manual y `defineSecret` con nombre por ambiente.

## D-018 · 2026-10-14 · Importación de la planilla — vigente
- **Decisión:** en la importación, un stock negativo o vacío se toma como 0 y se informa en un reporte de filas corregidas. Los nombres en mayúsculas se guardan tal cual en `sourceName`, y el nombre para mostrar se edita en el admin.
- **Por qué:** la planilla tiene un stock de -5 y uno vacío, y no se puede vender stock inexistente.

## D-020 · 2026-10-14 · Repositorio público — vigente (decisión de Carlos)
- **Decisión:** `PardoDeveloper/e-commerce_nutra_elements` queda público por ahora. Carlos lo hará privado más adelante.
- **Alternativas:** privado (lo recomendaba el tech-lead).
- **Por qué:** decisión del dueño. Mitigaciones obligatorias: nada de secretos ni datos del negocio en git (D-013, D-017); qa-reviewer y devops revisan que no haya secretos antes de cada push. La seguridad no puede depender de que el código sea secreto: debe sostenerse en las reglas y en el servidor.

## D-021 · 2026-10-14 · Dev en Spark: el desarrollo se hace en el Emulator Suite — vigente (decisión de Carlos)
- **Decisión:** `nutraelementsdev` sigue en Spark.
  - **Todo el desarrollo y las pruebas se hacen en el Emulator Suite local**: Auth, Firestore, Storage y Functions. En el emulador funcionan todos, sin importar el plan.
  - El pago con Flow sandbox de punta a punta se prueba con un **túnel temporal** hacia el emulador de Functions, porque Flow necesita una URL pública de confirmación. La herramienta del túnel (por ejemplo, cloudflared) se elegirá en la tarea de Flow, con aprobación de Carlos, porque es una herramienta nueva.
  - **No hay URL de dev publicada.** Las auditorías de SEO y QA se hacen sobre `next build && next start` en local, contra los emuladores.
- **Mitigación (prod como staging antes del lanzamiento):** como todavía no hay clientes, la primera publicación en `nutraelements` se hace con `noindex`, Flow sandbox y sin apuntar el dominio. Solo después de una prueba de humo y de la confirmación de Carlos se cambia a Flow de producción, se quita el noindex y se apunta nutraelements.cl.
- **Alternativas:** dev en Blaze (recomendado por el tech-lead; Carlos lo descartó).
- **Riesgo aceptado:** la primera vez que el código corre en la nube real es en el proyecto de prod, antes del lanzamiento público.

## Datos de negocio confirmados el 2026-10-14
- Envío gratis: monto configurable en el admin, sin valor por defecto (desactivado hasta que se configure).
- Retiro en tienda: Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00.
- Reserva de 48 horas para transferencias (D-006): PENDIENTE. Mientras tanto, 48 h configurable en settings. Formato NE-000123: Carlos confirma que DispatchTrack lo acepta.

## D-022 · 2026-10-14 · Renderizado: catálogo estático con ISR, cerca del cliente — vigente (aprobada por Carlos)
- **Decisión:**
  - /, /productos, /categorias/[slug], /productos/[slug], /nosotros, /contacto y /preguntas-frecuentes se generan como **páginas estáticas con ISR**, y el CDN de App Hosting las sirve cerca de Chile.
  - Cuando el admin cambia un producto, un precio, el stock o un descuento, se **revalida bajo demanda** la ficha afectada y su categoría, sin esperar al vencimiento.
  - El precio y el stock **mostrados** pueden tener unos segundos de retraso. El precio y el stock **cobrados** siempre los recalcula el servidor al crear el pedido (D-005).
  - Carrito, checkout y admin se renderizan dinámicamente y llevan noindex.
- **Alternativas:** SSR en cada visita, que suma la latencia desde `us-east4` y más costo por bots.
- **Por qué:** compensa que App Hosting no esté en Santiago, mejora los Core Web Vitals (SEO) y reduce lecturas y costo.

## D-023 · 2026-10-14 · Categorías y estrategia SEO del catálogo — vigente (tech-lead, sobre la propuesta de seo-specialist)
- **Decisión:**
  - Seis categorías: `vitaminas`, `magnesio`, `minerales`, `omega-3`, `belleza` y `bienestar`. La línea Ultra va en `bienestar`.
  - **Una ficha por SKU**, con canonical a sí misma. Los tamaños se diferencian en title, H1 y slug, y se enlazan entre sí.
  - No se crean páginas por comuna ni `/retiro-en-tienda`: lo local se trabaja en `/contacto`, la home y las preguntas frecuentes.
  - El catálogo no se pagina en el MVP.
  - `revalidate` de 3600 s como respaldo del ISR.
  - Variables `SITE_URL` y `SITE_INDEXABLE`; esta última es false por defecto y es el interruptor único del noindex de prelanzamiento (D-021).
  - Teléfono, correo, redes y logo: PENDIENTE, y se omiten del JSON-LD hasta que existan.
- **Alternativas:** una ficha por familia con selector de tamaño (no calza con un SKU por producto) o canonical al tamaño principal (plan B, solo si Search Console muestra duplicados).
- **Por qué:** es lo más simple que evita contenido duplicado con 33 SKU, y es coherente con D-016.
- **Riesgo regulatorio a revisar por Carlos:** Ultra Light, Ultra Relax, Ultra Lax, cranberry, melena de león y cúrcuma. Ultra Lax puede ser un tema sanitario, no solo de redacción. Los textos pasan por un profesional antes de publicarse.

## D-024 · 2026-10-14 · Contratos de datos y funciones: resoluciones del tech-lead — vigente
Se aceptan `contracts/data-model.md` y `contracts/functions.md` como base, con estas resoluciones a las preguntas abiertas:
- **P1 Categorías:** las de D-023. El ejemplo de 2.1 debe corregirse: el SKU 2427844 es la Vitamina B12, y el Citrato de Magnesio va en `magnesio`.
- **P3 Número inicial:** NE-000001. DispatchTrack acepta el formato.
- **P8 Imágenes:** máximo 2 MiB, comprimidas en el navegador a WebP (lado largo ≤ 1600 px).
- **P9 Retroceder un estado logístico:** **sí**, solo admin y solo un paso atrás, registrado en `statusHistory` con un motivo obligatorio. **Por qué:** un clic errado en "Entregado" no puede quedar sin corrección; la operación real lo necesita (correctitud > simplicidad).
- **P10 Ofertas con fechas:** no en el MVP.
- **P11 Envío gratis:** se combina con descuentos; se compara el subtotal con descuentos con `>=`.
- **P12 Login del admin:** correo y contraseña, con el auto-registro desactivado. MFA queda para después del lanzamiento.
- **P13 Reimportar la planilla:** pisa precio y stock (Control Farma es la fuente de verdad) y nunca toca contenido ni descuentos.
- **Excel de stock con una celda vacía:** se trata como **fila inválida**, no como 0. **Por qué:** una celda vacía no debe dejar un producto sin stock por accidente.
- **Límites anti-abuso** (5 pedidos cada 10 min por IP y 3 pendientes por correo): se aceptan como valores iniciales configurables.
- **P5 Pedidos pagados que se cancelan o reembolsan (respuesta de Carlos):** el reembolso se hace **a mano** en Flow o por transferencia, fuera del sistema. El admin lo **registra en el pedido** con una función `recordManualRefund`:
  - Transición `paid → refunded`, con monto, medio (flow o transferencia), fecha, nota obligatoria y quién lo hizo, todo en `statusHistory`.
  - Es terminal.
  - El stock **no** se repone solo: hay una opción explícita "reponer stock", porque el producto puede haber salido ya.
  - Las métricas restan el pedido reembolsado.
- **P6 RUT (respuesta de Carlos):** **obligatorio** en el checkout, en `customer.rut`. Se valida en el cliente y en el servidor con dígito verificador (módulo 11) y se normaliza a `12345678-K`. Es un dato personal: no se expone en `getOrderStatus`. **No hay factura:** solo boleta manual en Control Farma, sin razón social ni giro.
- **Aún abierta:** P2, reservas de 30 min y 48 h (pendiente del jefe; quedan como valores configurables). P7 (retención de datos personales) queda para después del lanzamiento, con revisión legal según la Ley 21.719.
- **Por verificar en la implementación:** la API de Flow (parámetros, firma y retorno), las opciones de firebase-functions v2, el emulador con secretos y la librería para leer .xls.

## D-025 · 2026-10-14 · Confirmaciones sobre los contratos v1 — vigente
- **Confirmado:**
  - (1) D-018 (vacío o negativo → 0) aplica **solo al crear** un producto en `importCatalog`. Si el producto ya existe, una celda vacía da `EMPTY_STOCK`.
  - (3) Con `restock: true`, `stockState` pasa a `released`; con `false`, queda `committed`.
- **Corregido (2), reembolso parcial:** **no** se resta el pedido completo de las métricas.
  - Los **ingresos** se reducen solo en `refund.amount`, en el día de `paidAt`.
  - Las **unidades vendidas** se restan solo si `restock: true`.
  - `ordersCount` no cambia. El ticket promedio se calcula con los ingresos netos.
  - **Por qué:** restar el pedido completo por un reembolso parcial falsea las ventas (correctitud).
  - firebase-architect debe ajustar `functions.md` (sección 4.6, línea "Un reembolso parcial…") y la sección de métricas de `data-model.md` al empezar la Fase 2B. Es la primera tarea de la próxima sesión.
  - **Detalle (tech-lead, 2026-10-14), para que el contrato no quede ambiguo:**
    - `metrics/daily`: `revenue -= refund.amount`; se agregan `refundsCount += 1` y `refundedAmount += refund.amount`; `ordersCount` y `merchandise` no cambian (`merchandise` es la mercadería bruta antes de reembolsos); `unitsSold -= Σqty` solo si `refund.restocked == true`.
    - `metrics/products/items/{sku}`: `unitsSold -= qty` y `revenue -= lineTotal` solo si `refund.restocked == true`. Sin reposición no cambian.
    - Se usa `restocked` (lo que de verdad pasó), no `restock` (lo pedido).
    - Ticket promedio = `revenue / ordersCount` (neto).
    - Aplica igual a reembolsos totales y parciales: una sola regla.
