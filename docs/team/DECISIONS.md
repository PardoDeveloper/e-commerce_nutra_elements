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

## D-010 · 2026-10-14 · Región — propuesta
- **Decisión:** usar `southamerica-west1` (Santiago) para Firestore, Functions y Storage, **solo si se confirma** que App Hosting funciona en esa región o en una cercana con latencia aceptable. Si App Hosting no está en Santiago, se elegirá con evidencia entre ubicar todo junto a la región de App Hosting o separar las regiones usando caché o ISR.
- **Por qué:** la región de Firestore no se puede cambiar después de crear la base, así que se verifica primero (tarea 0.9).

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

## D-021 · 2026-10-14 · Limitaciones de dev en Spark — pendiente de resolver
- **Problema:** el flujo de pago con Flow sandbox necesita Cloud Functions desplegadas o un túnel hacia el emulador, porque Flow llama a una URL de confirmación pública. En Spark no hay Functions ni App Hosting.
- **Opciones:** (a) pasar `nutraelementsdev` a Blaze, con una alerta de presupuesto baja; el costo esperado es casi 0, sin verificar. (b) Mantenerlo en Spark: el trabajo diario se hace en el Emulator Suite y el pago end-to-end se prueba con un túnel temporal; no habría URL de dev publicada.
- **Recomendación del tech-lead:** (a), porque permite probar en la nube exactamente lo que irá a prod. Lo decide Carlos, porque implica costo.

## Datos de negocio confirmados el 2026-10-14
- Envío gratis: monto configurable en el admin, sin valor por defecto (desactivado hasta que se configure).
- Retiro en tienda: Av. Concha y Toro 180, Puente Alto, de lunes a viernes de 9:00 a 20:00.
- Reserva de 48 horas para transferencias (D-006): pendiente de confirmar con el jefe. Formato NE-000123: Carlos confirma que DispatchTrack lo acepta.
