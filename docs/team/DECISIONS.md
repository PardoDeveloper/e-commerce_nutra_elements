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

## D-026 · 2026-10-14 · Fase 2B sin emuladores ni túnel por ahora; Node 24 — vigente (decisión de Carlos)
- **Decisión:**
  - Por ahora no se levantan los emuladores. Se construye y se verifica con build, lint y **tests unitarios** de lógica pura (precios, RUT, transiciones de estado, métricas y parseo de Excel), con Firestore simulado cuando haga falta.
  - Los tests de reglas y los de transacciones contra el emulador **se escriben, pero no se ejecutan**. Quedan marcados como "sin ejecutar" hasta que Carlos autorice los emuladores. No se instala Java mientras tanto.
  - Flow se implementa contra un mock de `getStatus`. El túnel (cloudflared u otro) queda **pendiente para el futuro**.
  - Las Functions usan la versión de Node ya instalada: Node 24 LTS (`engines.node: "24"`). firebase-architect confirma en la documentación oficial que Cloud Functions la soporta; si no la soporta, lo informa sin instalar nada.
- **Alternativas:** instalar Java y levantar los emuladores ahora (propuesta del tech-lead).
- **Por qué:** decisión de Carlos.
- **Riesgo aceptado:** las reglas de seguridad y la concurrencia del stock **no quedan verificadas** hasta correr esos tests. Nada sale a prod sin ejecutarlos (regla 5 de AGENTS.md).

## D-027 · 2026-10-14 · Resoluciones del tech-lead sobre las tareas 2B.2, 2B.3 y 2C.1 — vigente
- **2B.3 (lógica común), se aceptan las tres:**
  - Los SKU duplicados en un pedido se rechazan con `INVALID_INPUT`; el carrito los fusiona antes de enviar.
  - Un umbral de envío gratis inválido (0, negativo, decimal) se ignora, es decir, no hay envío gratis.
  - El RUT tiene una sola forma normalizada: cuerpo de 7 u 8 dígitos sin ceros a la izquierda.
  - **Por qué:** en los tres casos es la opción más segura y simple.
- **2B.2 (reglas):**
  - Se aceptan como valores por defecto restrictivos:
    - `communes` con 1 a 400 elementos.
    - `orderNumberStart` como máximo 100.000.000.
    - `format` de 1 a 40 caracteres.
    - `settings/public` solo con `get`.
  - firebase-architect los incorpora al contrato (v1.2) en su próxima tarea.
  - Se acepta que Storage no contraste el nombre con el contenido del archivo.
  - **Un producto no se borra** (data-model.md, "Un producto no se borra"). Un SKU creado por error se marca `active=false`.
- **2C.1 (Next.js):**
  - robots.txt **no** bloquea /carrito, /checkout ni /cuenta, porque así Google puede leer su noindex (contrato SEO 06, sección 4). El contrato manda sobre el encargo del tech-lead, que estaba mal.
  - `cacheComponents` queda **desactivado**, porque usamos `revalidate` e ISR (D-022 y D-023).
  - App Check con reCAPTCHA Enterprise.
  - Si `next dev` reescribe un bloque de AGENTS.md, ese cambio **no se acepta** y se revierte.
  - CSS plano con variables; los tokens de diseño se definen cuando Carlos entregue la marca (logo y colores).

## D-028 · 2026-10-14 · Prototipo visible para la demo del 2026-10-15 — vigente (pedido de Carlos)
- **Decisión:** se construye todo lo visible (tienda pública, carrito, checkout y admin) con **datos simulados detrás de una capa de datos** (`src/lib/data/`), para cambiarla por Firestore y Functions sin rehacer pantallas.
  - Sin Firebase real, sin emuladores (D-026) y sin commits por ahora; devops y QA van después.
  - **Marca:** logo de hojas (`img/elements.png`) a la izquierda y el texto (`img/elements_2.png`) a su lado. Paleta: verde, azul marino y blanco, con el dorado del logo como acento.
  - **Catálogo de la demo:** un script local lee la planilla y genera `src/data/catalog.local.json`, que **queda ignorado por git** (D-017). Solo usa nombre, SKU, precio y si hay stock (sí/no), nunca la cantidad. En el repo hay un fixture ficticio de respaldo.
  - Para leer el .xls se usa SheetJS como devDependency, instalado desde su CDN oficial (el paquete de npm está desactualizado). firebase-architect lo puede reutilizar en la 2B.6.
  - El carrito y el checkout calculan el total **solo para mostrarlo**. En producción manda el servidor (D-005). El pago y el número de pedido son simulados.
  - El admin muestra un aviso de "Modo demostración"; sus acciones no persisten. Antes de producción, el modo demo se elimina y se reemplaza por Auth con el claim de admin (D-011).
  - Las imágenes de productos son marcadores generados con los colores de la marca, hasta que existan las fotos reales.
- **Por qué:** Carlos necesita mostrar un prototipo mañana. La capa de datos evita tener que tirar las pantallas.
- **Riesgo:** el modo demo del admin no debe llegar a producción; qa-reviewer lo revisará.

## D-029 · 2026-10-19 · Eliminar productos con selección múltiple (eliminación lógica) — vigente (pedido de Carlos; actualiza D-027)
- **Decisión:** el admin puede seleccionar productos con checkbox (también "seleccionar todos" sobre la lista filtrada) y **eliminarlos**.
  - La eliminación es **lógica**: el producto recibe `deletedAt` y `deletedBy`, queda `published=false`, desaparece de la tienda y de la lista normal del admin, y su ficha da 404 tras la revalidación.
  - El documento y sus imágenes se conservan, para que los pedidos, las métricas y el historial sigan resolviendo el SKU.
  - Hay un filtro "Eliminados" con la acción "Restaurar" (vuelve despublicado).
  - **Confirmación:** un diálogo que muestra cuántos productos se eliminarán. Si son más de 5, hay que escribir `ELIMINAR`. Máximo 200 por operación.
  - **Importaciones:** una fila con un SKU eliminado **no lo revive**. Se reporta como fila inválida `PRODUCT_DELETED`, tanto en la planilla como en precio y stock.
  - Los pedidos existentes no cambian (tienen snapshot).
- **Alternativas:**
  - Borrado físico, que rompe pedidos y métricas, y que la próxima planilla volvería a crear.
  - Solo desactivar, que no es lo que pidió Carlos.
- **Por qué:** cumple el pedido ("eliminar", y desaparece) sin perder la integridad de los pedidos (correctitud). Además es reversible ante un error de selección.
- **Si Carlos quiere borrado físico definitivo**, se agrega después como "Vaciar papelera" solo para productos sin pedidos.
- **Contrato:** firebase-architect agrega `deleteProducts` / `restoreProducts` y el campo `deletedAt` a los contratos (v1.2).
- **2026-10-19, tech-lead:** contratos v1.2 aprobados (D-027 y D-029 aplicadas). Los índices que no incluían `deletedAt` se **reemplazan** (no hay nada desplegado). Todo producto lleva `deletedAt: null` explícito. Next.js lee con el Admin SDK, así que debe filtrar `deletedAt == null` por su cuenta.

## D-030 · 2026-10-19 · Persistencia local del prototipo: los cambios del admin se ven en la tienda — vigente (pedido de Carlos)
- **Decisión:** mientras no haya Firebase (D-026), el servidor de Next.js guarda en disco los cambios de **productos** hechos en el admin, para que la tienda los muestre:
  - Qué se guarda: contenido, imágenes, precio y stock, publicar, eliminar o restaurar, y descuentos.
  - Dónde: `.demo-data/` en la raíz, ignorada por git. Las imágenes se guardan en `.demo-data/images/` y se sirven desde una ruta propia, porque `public/` no sirve archivos agregados después del build.
  - La capa `@/lib/data` (mock) mezcla esos cambios con el catálogo.
  - Al guardar, se llama a `revalidatePath` sobre la ficha, la categoría, /productos y /, igual que lo hará la revalidación bajo demanda real (D-022).
  - Pedidos, métricas y ajustes siguen en memoria.
- **Seguridad:** las rutas de escritura **solo existen si `DEMO_PERSISTENCE === "true"`** y nunca en producción.
  - Sin la variable, responden 404 y el admin vuelve al modo en memoria.
  - Se validan el tipo y el tamaño de las imágenes (WebP, JPEG o PNG; ≤ 2 MiB). El nombre del archivo lo genera el servidor, sin rutas del cliente.
  - El SKU se valida contra el catálogo.
  - qa-reviewer bloquea cualquier despliegue con `DEMO_PERSISTENCE` o con el código demo activo.
- **Alternativas:**
  - Integración real con Firebase: requiere emuladores (Java) o dev en Blaze. Es la solución definitiva y sigue pendiente.
  - localStorage: solo sirve en un navegador.
- **Por qué:** Carlos necesita ver de punta a punta el efecto del admin en la tienda. Es lo más simple que reproduce el flujo real (servidor → revalidación) sin cambiar D-026. Todo el código queda aislado para reemplazarlo por Firestore y Storage.

## D-031 · 2026-10-19 · Producción como backend real (staging antes del lanzamiento) — vigente (decisión de Carlos)
- **Decisión:** se trabaja contra `nutraelements` (Blaze) en modo staging, como en D-021: noindex, Flow sandbox y sin dominio.
  - Firestore y Storage en **us-east4**, confirmado por Carlos (irreversible, D-010).
  - Orden: catálogo, admin e imágenes reales primero; después compras con Flow sandbox. En prod, `flowConfirm` tiene URL pública, así que no hace falta el túnel.
- **Reglas sin tests ejecutados (riesgo aceptado por Carlos):** se publican sin instalar Java.
  - Mitigación: deny-by-default, revisión estática de qa-reviewer, compilación de las reglas en el deploy, y prueba manual con el SDK cliente después del despliegue.
  - Queda pendiente ejecutar `test:rules` cuando haya Java.
- **Login:** correo y contraseña, más Google.
  - El admin se habilita **solo** con el claim `admin` (D-011). Iniciar sesión, incluso con Google, no da permisos.
- **Primer administrador (bootstrap), sin credenciales locales:**
  - Una función `claimAdmin` asigna el claim solo si el correo del usuario está en la lista `ADMIN_EMAILS` (parámetro de Functions, no es secreto) **y `email_verified == true`**.
  - Con el claim asignado, se usan `grantAdmin` y `revokeAdmin`.
  - **Por qué:** evita guardar claves de cuenta de servicio y evita depender de gcloud.
- **Lecturas de Next.js:** el catálogo público se lee con el SDK cliente de Firestore bajo las reglas públicas (published, active y `deletedAt == null`); el admin lee como usuario autenticado con el claim. Las escrituras de dinero, stock, publicación y eliminación van por Functions. No hay Admin SDK en Next.js. La revalidación se hace con `/api/revalidate` y `REVALIDATE_SECRET` (Secret Manager).
- **Cuenta `admin@gmail.com` con contraseña `admin123`: NO se crea (tech-lead, seguridad > preferencias).**
  - `admin@gmail.com` no es un correo de Carlos. Su dueño real podría recuperar la contraseña o entrar con Google y quedarse con el admin de la tienda.
  - `admin123` aparece en todas las listas de contraseñas filtradas.
  - Se propone que Carlos use su propio Gmail, entrando con Google: es lo más simple y no requiere contraseña. La lista `ADMIN_EMAILS` se fija cuando Carlos confirme el correo.
  - Las contraseñas nunca se escriben en archivos ni en el repo.

## D-032 · 2026-10-19 · Resoluciones sobre 2B.6, admin y triggers — vigente (tech-lead)
- **Se aceptan:**
  - Las extensiones aditivas del catálogo: `changes` en `BatchReport`, `discountRemoved`, `INVALID_PRODUCT_DATA`, `MISSING_NAME`, `BARCODE_TOO_LONG` y `PARTIAL_FAILURE`.
  - `imports.kind` incluye `create` y `update`.
  - Auditoría posterior a las transacciones, con `PARTIAL_FAILURE`.
  - Slug único entre productos vigentes.
  - Números estrictos (`"1,000"` es inválido; `"1.000"` = 1000).
  - Reintento acotado de los triggers: 3 intentos, solo ante error de red, 429 o 5xx. Cambia la sección 8.1 del contrato.
  - `claimAdmin` (sección 5.8b) con `ADMIN_EMAILS` y `email_verified`.
  - El admin puede editar el contenido de un producto eliminado (QA, S-2).
- **Se corrige:** el tipo `AuthRequestLike` de `common/auth.ts` debe aceptar `CallableRequest` y se quitan los rodeos de `admin` y `catalog`.
- **Por qué:** son cambios aditivos o más estrictos (seguridad y correctitud) y ya tienen tests.
- Los contratos pasan a la v1.3.

## D-030 · 2026-10-19 · Un solo proyecto de trabajo: `nutraelements` (Blaze) — vigente (decisión de Carlos; reemplaza D-009 y D-021)
- **Decisión:** el desarrollo y las pruebas con Firebase real se hacen en `nutraelements` (plan Blaze).
  - Verificado en solo lectura el 2026-10-19:
    - Firestore `(default)` en `us-east4`, modo nativo.
    - Web app `nutra-web`.
    - Bucket `nutraelements.firebasestorage.app`.
  - Carlos creó Firestore y Authentication (con un usuario).
  - `nutraelementsdev` y `nutraelementsprod` quedan **sin uso** (no se borran).
  - `.env.local` ya apunta a `nutraelements`.
- **Alternativas:** mantener `nutraelementsdev` en Spark con emuladores (D-021).
- **Por qué:** decisión de Carlos. En Blaze se pueden desplegar Functions, Secret Manager y App Hosting, así que se puede conectar el admin con la tienda de verdad.
- **Riesgo:** no hay separación entre pruebas y producción. Mitigaciones:
  - El sitio sigue en noindex (`SITE_INDEXABLE=false`), con Flow sandbox y sin dominio, como ya decía D-021.
  - Las reglas de Firestore y Storage nunca se abren.
  - Alerta de presupuesto de 20 USD.
  - **Antes del lanzamiento**, limpiar los pedidos de prueba y reiniciar `counters/orders`, con confirmación de Carlos.
  - Más adelante, si se quiere aislamiento real, se vuelve a un proyecto de dev separado.
- **Regla de despliegue (AGENTS.md, regla 6):** como ahora es el proyecto con plan de pago, **cada despliegue a `nutraelements` requiere la confirmación explícita de Carlos sobre esa acción concreta**. La autorización de "usar el proyecto" no cubre desplegar.
- **Por actualizar** (devops, cuando Carlos confirme): el alias `default` de `.firebaserc` y `AGENTS.md`, que hoy dicen `dev → nutraelementsdev`. D-026 (sin emuladores) sigue vigente hasta que Carlos lo cambie.
- **Pendiente de confirmar:** la región del bucket (Carlos indicó "uest1", que se interpreta como `us-east1`; el CLI no la muestra).

## D-031 · 2026-10-19 · Integración real en `nutraelements`: autorizaciones y condiciones — vigente (decisión de Carlos)
- **Carlos autoriza:**
  - El plan de integración real (funciones, reglas, índices y conexión del frontend).
  - El despliegue de reglas e índices de Firestore y de las reglas de Storage a `nutraelements`. Cada despliegue siguiente se consulta aparte (D-030).
  - Flow **sandbox** por ahora.
  - **No instalar Java:** los tests de reglas siguen sin ejecutarse (D-026).
- **Admin inicial:** el usuario de Authentication es `admin@gmail.com`. **La contraseña no se escribe en ningún archivo.** Carlos reconoce que es provisoria y la cambiará.
- **Bloqueos antes de recibir pedidos reales o publicar el dominio** (qa-reviewer y devops lo verifican con Carlos):
  1. Cambiar la contraseña del admin por una fuerte, y usar un correo propio que reciba recuperaciones de contraseña, no `admin@gmail.com`.
  2. Activar MFA para el admin, o evaluar hacerlo.
  3. Cargar las credenciales de Flow en Secret Manager (las carga Carlos) y pasar a producción solo con su confirmación.
  4. Limpiar los pedidos de prueba y reiniciar `counters/orders` (D-030).
- **Por qué se acepta el riesgo hoy:** el sitio está en noindex y sin dominio, los datos son de prueba y el admin solo manipula datos de prueba.
- **Sin emuladores:** los tests de transacciones y de reglas siguen sin ejecutarse. El primer arranque real de estas funciones será en el proyecto en la nube.
- **2026-10-19, tech-lead (sobre D-031):** el primer admin se obtiene con la función `claimAdmin` (contrato 5.8b), que exige que el **correo esté verificado** y figure en el parámetro `ADMIN_EMAILS`. Una cuenta creada en la consola de Firebase no queda verificada. Por eso el admin real debe ser un **correo propio de Carlos, verificado**, no `admin@gmail.com`. Después de reclamar el rol, `ADMIN_EMAILS` se vacía. Los triggers reintentan 3 veces (cambio menor de la sección 8.1 del contrato, aceptado).
- **2026-10-19, tech-lead (sobre D-031):** Carlos pidió usar `admin@gmail.com` como admin. **No se pone en `ADMIN_EMAILS`.** Motivos: ese correo no es verificable por Carlos, y si el proveedor de Google está activo en Auth, quien sea dueño de esa dirección de Gmail podría iniciar sesión con Google y reclamar el rol de administrador. `ADMIN_EMAILS` se despliega **vacío** (nadie puede reclamar el rol) hasta que Carlos entregue un correo propio y verificable. Es reversible.
- **2026-10-19, tech-lead:** Carlos confirmó el primer despliegue: secreto `REVALIDATE_SECRET`, funciones de catálogo, admin y triggers, código a GitHub con PR de `develop` a `main`, backend de App Hosting en `us-east4` conectado a `main`, y pruebas de humo. El merge del PR lo aprueba Carlos.
- **2026-10-20, tech-lead (sobre D-031):** Carlos pidió quitar el inicio de sesión con Google. Se verificó con la API pública que **no está configurado** en `nutraelements` (`createAuthUri` con `google.com` responde `OPERATION_NOT_ALLOWED`), así que no hay nada que quitar y el riesgo de toma de cuenta por Google no existe hoy. **Si algún día se activa Google, esta decisión se revisa antes.** El comando correcto para crear el backend usa `--primary-region`, no `--location` (el handoff de devops tenía el flag equivocado).

## D-032 · 2026-10-20 · Pedidos y pagos: resoluciones tras el QA (B1) — vigente
- **Se acepta:**
  - El límite inicial de `getOrderStatus` sube a **120 consultas por IP cada 10 minutos**, porque el polling del retorno de Flow hace 18 a 30 en 90 s.
  - `order.flow.paidFlowOrder` entra al contrato (v1.4).
  - `ORDER_NOT_PAYABLE` en el reintento idempotente.
  - La huella de idempotencia más estricta.
  - La guarda anti-cobro real: en `local` y `staging` solo el sandbox de Flow.
- **Se corrige antes de la primera prueba de punta a punta con Flow:** A1, M1, M2 y M4 del QA.
- **Se corrige antes de usar Flow real (producción):** A2 (el token de acceso en la `urlReturn`) y las pruebas contra Firestore real.
- **M3:** un reintento idempotente de `createOrder` no debe invalidar el token ya entregado.
- **F3 (cómo se entera el admin de un `payment_review`):** sin correos en el MVP, el panel de pedidos muestra un contador y una etiqueta destacada de "Pagos en revisión". Se implementa en el admin (nextjs-frontend).
- **Despliegue:** pedidos y pagos se desploegan a `nutraelements` solo después de estas correcciones, con las credenciales de Flow sandbox cargadas por Carlos y con su confirmación para ese despliegue.

## D-033 · 2026-10-21 · Operación privilegiada única para dejar operativo el admin — vigente (autorizada por Carlos)
- **Contexto:** 10 de las 12 funciones invocables desde el navegador quedaron sin el permiso público de invocación tras el primer despliegue (devuelven 403 de IAM), y el usuario de Carlos no tiene el rol de administrador. En el equipo no hay `gcloud` ni credenciales por defecto.
- **Carlos autoriza (opción A):** usar la sesión de Firebase CLI de Carlos, **solo en memoria**, para dos acciones:
  1. Agregar el permiso público de invocación (`allUsers`, `roles/run.invoker`) **solo a los callables**: `claimAdmin`, `grantAdmin`, `revokeAdmin`, `createProduct`, `deleteProducts`, `restoreProducts`, `importPrices`, `importStock`, `setProductsPublished` y `updateProductCommerce`. **Los triggers de Firestore nunca se hacen públicos.**
  2. Dejar como administrador al usuario `carlos.pardo.b78@gmail.com` (custom claim `admin: true` y correo verificado). Ningún otro usuario.
- **Carlos NO autoriza:** la política de limpieza de imágenes de Artifact Registry (`functions:artifacts:setpolicy`). Queda pendiente.
- **Condiciones:** el token no se imprime ni se guarda; no se crean claves de cuentas de servicio; el script va fuera del repo y se borra; no se despliega nada más.
- **Por qué:** es el camino más corto y con menos superficie que instalar herramientas nuevas; son las mismas credenciales que Carlos ya usa para desplegar.

## D-034 · 2026-10-21 · Hero de la home: solo banner y botón, H1 oculto — vigente (pedido de Carlos)
- **Decisión:** el hero de `/` muestra únicamente `public/banner.jpeg` y un botón "Ver catálogo". El H1 sigue en el HTML, **único y visualmente oculto** con la técnica `srOnly` (no `display:none`). El párrafo introductorio y los CTA secundarios se eliminaron.
- **Desviación del contrato SEO 01-inicio.md:** el contrato pedía un texto introductorio de 40 a 80 palabras bajo el H1 con "Puente Alto", "RM" y "retiro en tienda". Esas menciones siguen en las secciones de despacho y "Por qué Nutra Elements" de la misma home.
- **Alternativas:** mantener el texto visible sobre o bajo el banner (descartada por Carlos).
- **Por qué:** decisión de diseño de Carlos. El H1 oculto mantiene la señal semántica para buscadores y lectores de pantalla.
- **Pendiente:** antes del lanzamiento, el seo-specialist debe confirmar o actualizar el contrato 01 y auditar la home (no estaba disponible en esta sesión).

## D-035 · 2026-10-23 · Credenciales de Flow editables desde Ajustes del admin — vigente (pedido de Carlos)
- **Decisión:** en Ajustes del admin, un usuario con el claim `admin` puede escribir la **API Key** y la **Secret Key** de Flow. Dos callables nuevas (contrato functions.md 5.10): `getFlowCredentialsStatus` y `setFlowCredentials`. El "token" de Flow no se configura: lo genera Flow en cada pago (Carlos confirmó que solo son API Key y Secret Key).
- **Dónde se guardan:** solo en **Secret Manager**, como versiones nuevas de `FLOW_API_KEY` y `FLOW_SECRET_KEY` (complementa D-013, no la contradice). Nunca en Firestore, nunca vuelven al navegador (solo "configurada", la fecha y los 4 últimos caracteres de la API Key) y nunca en los logs.
- **Cómo se aplican sin redesplegar:** el despliegue fija una versión de cada secreto; por eso, en la nube, las funciones de pago leen además la **última versión** con caché de 60 s por instancia. La versión fijada queda como respaldo. En local se sigue usando `functions/.secret.local`.
- **Alternativas:** guardarlas en un documento privado de Firestore (descartada por Carlos: contradice D-013 y deja las claves en la base de datos).
- **Riesgos y mitigaciones:**
  - Una cuenta admin comprometida puede redirigir los pagos a otra cuenta de Flow. Refuerza los bloqueos de D-031 (contraseña fuerte y MFA para el admin). Cada cambio queda en el log con el `uid`.
  - La guarda de ambiente sigue: con `APP_ENV=staging` la base es el sandbox, así que unas credenciales de producción no cobran de verdad.
- **Requisitos antes de usarlo en `nutraelements`** (devops, con confirmación de Carlos para cada acción):
  1. Que existan los secretos `FLOW_API_KEY` y `FLOW_SECRET_KEY` en Secret Manager.
  2. Dar a la cuenta de servicio de Functions `roles/secretmanager.secretAccessor` y `roles/secretmanager.secretVersionManager` sobre ambos secretos.
  3. Desplegar las funciones de pagos y pedidos, y las dos callables nuevas; agregar el permiso público de invocación (`roles/run.invoker`) solo a las dos callables, como en D-033.
  4. Desplegar el frontend (App Hosting desde `main`).
- **Pendiente:** QA (qa-reviewer) antes de subir; política de limpieza de versiones antiguas de los secretos (hoy se acumulan).

## D-036 · 2026-10-23 · Flow en producción y checkout real — vigente (pedido de Carlos)
- **Decisión:** Carlos pidió "hacer todos los cambios para estar en producción" con Flow. Se dejó listo el código y la configuración versionada; **ningún despliegue se hizo** (cada uno requiere su confirmación, D-030).
- **Cambios:**
  - **Checkout real:** el carrito, el checkout y la página del pedido usan las Cloud Functions (`createOrder`, `createFlowPayment`, `getOrderStatus`) cuando la fuente es `firebase`. El simulado queda solo para `demo`; `/checkout/flow-simulado` da 404 con Firebase. Cierra la parte de frontend de 2C.3.
  - **A2 resuelto:** `urlReturn` lleva solo el número de pedido. El token de acceso se guarda en `localStorage` del comprador (`ne.orderAccess.v1`, solo número y token). `Referrer-Policy: no-referrer` en `/checkout*` y `/pedido/*`. Contrato functions.md 3.3.1 (v1.5).
  - **`/checkout/retorno`:** route handler GET/POST que responde 303 a `/pedido/<número>` (número validado; si no, a `/`). La página del pedido consulta el estado cada 4 s durante 90 s mientras el pago con Flow está pendiente.
  - **Avisos:** `NEXT_PUBLIC_FLOW_ENV` (`apphosting.yaml` = `production`) decide los avisos. En producción no hay aviso de "pagos de prueba"; el admin muestra "Producción: los pagos con Flow son reales". Si la variable falta, el sitio nunca afirma que el pago sea de prueba.
  - **Functions:** `APP_ENV=production`, `FLOW_API_BASE=https://www.flow.cl/api`, `FLOW_CONFIRMATION_URL=https://us-east4-nutraelements.cloudfunctions.net/flowConfirm` en `functions/.env.nutraelements` (no versionado; lo agrega Carlos).
- **Desviación aceptada por Carlos:** se pasa a Flow real **sin la prueba de punta a punta en sandbox** que pedían D-021, D-030 y D-032, y **sin las pruebas contra Firestore real**. Mitigación: primera compra real de bajo monto hecha por Carlos, verificada en el admin y en el panel de Flow, y reembolsada a mano.
- **Sigue fuera de este cambio:** quitar el noindex (`SITE_INDEXABLE`), el dominio y Search Console (PR.7b, 2D.4).
- **Siguen pendientes de D-031** (Carlos): contraseña fuerte y correo propio del admin, MFA, datos bancarios reales (con Firebase la transferencia no se ofrece hasta que exista una función que informe el banco), y limpiar los pedidos de prueba y `counters/orders`.

## D-037 · 2026-10-23 · Sitio indexable — vigente (pedido de Carlos)
- **Decisión:** `SITE_INDEXABLE=true` en `apphosting.yaml` para que Google encuentre los productos. Se activan robots.txt con `Allow` (bloquea `/admin/` y `/api/`), el sitemap y quitar el `X-Robots-Tag: noindex` global. Carrito, checkout, pedido y admin mantienen su propio `noindex`.
- **Desviación:** el contrato SEO y PR.7b pedían indexar recién con el dominio `nutraelements.cl` y tras la auditoría del seo-specialist (pendiente, D-034). Hoy la URL canónica es la de App Hosting (`SITE_URL`).
- **Riesgo:** Google indexa `*.hosted.app`. Al pasar al dominio hay que cambiar `SITE_URL`, verificar el dominio en Search Console y redirigir 301 desde `hosted.app` para no partir el posicionamiento.
- **Efecto:** solo al publicar `main` en App Hosting (con confirmación de Carlos).

## D-038 · 2026-10-23 · Dominio nutraelements.cl como SITE_URL y número de pedido solo tras pagar — vigente (pedido de Carlos)
- **Causa del error "No pudimos conectar con Flow":** `SITE_URL` estaba vacío en `functions/.env.nutraelements`, así que `createFlowPayment` rechazaba la configuración (`FlowConfigError`) sin llamar a Flow. Ahora el log incluye `problems` (solo nombres de variables).
- **SITE_URL = `https://nutraelements.cl`** en Functions y en `apphosting.yaml`. El dominio ya sirve el sitio. Debe ser el mismo origen en ambos: Flow devuelve al comprador a `SITE_URL` y el token del pedido vive en el `localStorage` de ese origen. También corrige las canónicas y el sitemap.
- **Número de pedido:** con Flow no se muestra hasta que el pago se recibe (`paid`, `payment_review`, `refunded`). Si no se puede iniciar el pago, el comprador se queda en el checkout con el carrito intacto y reintenta sobre el mismo pedido. Con transferencia sí se muestra al crear el pedido, porque es la glosa.
- **Pendiente:** redirigir 301 `*.hosted.app` → `nutraelements.cl` y configurar `www`.
