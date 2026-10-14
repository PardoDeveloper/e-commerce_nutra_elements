# Handoff firebase-architect: aislar dev de prod en un solo proyecto (tarea 0.9b)

Fecha: 2026-10-14. Solo diseño. No se creó ni habilitó nada, no se escribió código ni configuración, no se tocó git ni los archivos protegidos (AGENTS.md, CLAUDE.md, PLAN.md, DECISIONS.md, DESCUBRIMIENTO.md).

## 0. Qué verifiqué y qué no

Verificado en el código de firebase-tools 15.34.0 instalado (solo lectura) y con `--help`:
- App Hosting reconoce archivos `apphosting.yaml` (base) y `apphosting.<ambiente>.yaml` (regex `^apphosting(\.[a-z0-9_]+)?\.yaml$`), además de `apphosting.emulator.yaml` y `apphosting.local.yaml`. El archivo de ambiente se superpone al base.
- `firebase.json` acepta varios backends de App Hosting (`backendId`, `rootDir`, `ignore`, `alwaysDeployFromSource`).
- `firebase apphosting:rollouts:create <backendId> --git-branch <rama>` existe: permite crear el rollout a mano.
- Functions: se permiten dos codebases con el mismo `source` si el `prefix` es distinto. El prefijo se aplica como `<prefix>-<nombreFuncion>` (por ejemplo `dev-createOrder`). Verificado en `projectConfig.js` y `build.js`.
- Los triggers de Firestore de Functions 2ª gen admiten una base con nombre (filtro `database`, por defecto `(default)`). Verificado en `deploy/functions/services/firestore.js`.
- `.env.<alias>` se carga según el alias del proyecto (`findEnvfiles` en `functions/env.js`): con dos alias que apuntan al mismo proyecto, cada uno carga su archivo. Si existen a la vez `.env.<projectId>` y `.env.<alias>`, la CLI da conflicto: no crear `.env.nutraelements`.
- `firebase deploy -c/--config <ruta>` existe, y `firebase firestore:databases:create` acepta una base con nombre y `--location`.
- La API de Firestore sigue deshabilitada en `nutraelements` (403), así que no pude listar ubicaciones. Sigue sin estar en Blaze.

NO verificado (no hay acceso a la documentación oficial desde aquí; confirmar antes de ejecutar):
1. Cómo se asocia un backend de App Hosting con su `apphosting.<ambiente>.yaml`. Por memoria es el campo "Environment name" en la configuración del backend (consola), pero no lo pude comprobar. La CLI solo confirma el nombre de los archivos.
2. Que el ID de la base con nombre admite 3 letras. Por memoria Firestore pide de 4 a 63 caracteres, así que `dev` no serviría; por eso propongo `nutra-dev`.
3. Que la base con nombre puede estar en la misma región que `(default)` (por memoria sí), y que la capa gratuita de Firestore se comparte por proyecto entre bases (por memoria sí; si fuera por base, mejor aún).
4. Que `firebase deploy --only firestore:<databaseId>` funciona con la sintaxis exacta; el esquema de `firebase.json` sí admite un arreglo de bases con `database`, `rules` e `indexes`.
5. Que el emulador de Firestore soporta bases con nombre, que la opción `database` de los triggers acepta un parámetro (`defineString`), y que `defineSecret` puede recibir un nombre calculado al desplegar a partir de `process.env`.
6. Que un backend de App Hosting permite desactivar los rollouts automáticos.
7. Cuotas y precios (Secret Manager, Cloud Scheduler, Artifact Registry): son órdenes de magnitud de memoria.
8. Si Flow guarda una URL de confirmación por defecto en la cuenta además de la que envía la API.

## 1. Recomendación (una sola opción)

**Un único proyecto `nutraelements`, con dos "pilas" completas y paralelas, cada una nombrada por su ambiente, más el Emulator Suite para el trabajo diario.**

| Pieza | dev (rama develop) | prod (rama main) |
|---|---|---|
| App Hosting | backend `nutra-dev` | backend `nutra-prod` |
| Firestore | base con nombre `nutra-dev` | base `(default)` |
| Storage | bucket aparte `nutraelements-dev` | bucket por defecto del proyecto |
| Functions | codebase `dev`, prefijo `dev` (`dev-createOrder`) | codebase `prod`, sin prefijo (`createOrder`) |
| Secretos | `FLOW_API_KEY_SANDBOX`, `FLOW_SECRET_KEY_SANDBOX` | `FLOW_API_KEY_PROD`, `FLOW_SECRET_KEY_PROD` |
| Flow | sandbox | producción |
| Alias `.firebaserc` | `dev` → nutraelements | `prod` → nutraelements |
| App Check / app web | app web `web-dev` con su propia clave | app web `web-prod` con su propia clave |
| Auth | compartido | compartido |

Principio: **el aislamiento se logra por configuración y barreras en el código, no por IAM.** En un mismo proyecto, la cuenta de servicio por defecto puede leer ambas bases. El aislamiento real por permisos (cuentas de servicio separadas con condición IAM por base) es endurecimiento opcional de una fase posterior (pregunta 6).

### 1.1 App Hosting: dos backends
- `nutra-dev` con rama viva `develop`; `nutra-prod` con rama viva `main`. Mismo repo, mismo `rootDir`.
- Archivos: `apphosting.yaml` (base, común), `apphosting.dev.yaml` y `apphosting.prod.yaml`. Cada backend queda configurado con su "environment name" (`dev` o `prod`) (punto 1 de "no verificado").
- Valores por ambiente (todo no secreto): `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_FIRESTORE_DB_ID` (`nutra-dev` o `(default)`), `NEXT_PUBLIC_STORAGE_BUCKET`, `NEXT_PUBLIC_FUNCTIONS_PREFIX` (`dev-` o vacío), clave de App Check y `maxInstances` bajo. Los secretos se referencian por nombre de Secret Manager (`secret:`), nunca por valor.
- `nutra-prod` con `minInstances: 0` y `maxInstances` acotado, por costo.
- Para evitar "desplegar a prod por error": recomiendo **rollouts manuales en `nutra-prod`** (si la consola permite desactivar el automático), creados por devops con `firebase apphosting:rollouts:create nutra-prod --git-branch main` solo tras la confirmación de Carlos. `nutra-dev` queda con rollout automático al hacer push a develop. Además, protección de rama en `main` en GitHub (el repo es público; verificar que aplica en el plan gratuito).
- `nutra-dev` queda con URL `*.hosted.app`, sin dominio propio; `nutraelements.cl` va solo a `nutra-prod`. Noindex y `robots.txt` con `Disallow: /` en dev (decisión para seo-specialist: la URL de dev no debe indexarse).

### 1.2 Firestore: base con nombre `nutra-dev` frente a `(default)`
- Reglas: un mismo archivo `firestore.rules` para ambas bases (un arreglo en `firebase.json`, una entrada por base). Así dev prueba exactamente las reglas de prod y los tests se escriben una vez. Se despliegan por base, dev primero.
- Índices: un mismo `firestore.indexes.json`, pero **se construyen por base**: hay que desplegarlo a las dos.
- Triggers: cada codebase declara su base (`database: "nutra-dev"` en dev, `(default)` en prod). Es lo más fácil de olvidar. Un trigger de dev sin `database` escucharía la base de prod. Barrera: la base se lee de una sola constante de configuración por ambiente.
- Región: crear dev en la **misma región que prod**, para medir la latencia real. Hay que decidir la región de `(default)` antes (D-010; es irreversible).
- Costo: la base con nombre está vacía y casi sin tráfico; costo esperado cercano a cero (la capa gratuita se comparte por proyecto, por memoria). El almacenamiento de dev son kilobytes.
- Limitaciones a tener presentes: la consola y algunas extensiones asumen `(default)`; cada base se exporta y respalda por separado; no se pueden consultar documentos entre bases; los SDK de cliente y Admin deben pasar el ID (`getFirestore(app, id)`). Todo el acceso a Firestore pasa por un único módulo (`src/lib/firebase` y `functions/src/config`), nunca `getFirestore()` suelto.
- Datos de dev: se siembran con el mismo importador de la planilla y datos ficticios. **Nunca se copian pedidos ni clientes de prod a dev** (datos personales).

### 1.3 Storage: bucket aparte para dev
- Un bucket `nutraelements-dev` (misma región), creado por Carlos o devops en la consola. Reglas: el mismo `storage.rules` en ambos (arreglo con `bucket` en `firebase.json`).
- Por qué no un prefijo: un prefijo `dev/` en el bucket de prod comparte reglas, listados y permisos de borrado; una prueba de borrado masivo en dev podría tocar imágenes reales. Un bucket separado cuesta lo mismo y elimina ese riesgo con una variable.

### 1.4 Cloud Functions: dos codebases con el mismo código
`firebase.json` con dos entradas, ambas con `source: "functions"`:
- `{ codebase: "prod", source: "functions" }` → funciones `createOrder`, `flowConfirm`, etc.
- `{ codebase: "dev", source: "functions", prefix: "dev" }` → `dev-createOrder`, `dev-flowConfirm`, etc.

Cada una lee su configuración de `functions/.env.dev` o `functions/.env.prod`, que se cargan por **alias** (verificado). Contenido: `APP_ENV`, `FIRESTORE_DB_ID`, `STORAGE_BUCKET`, `FLOW_BASE_URL` (sandbox o producción), `EMAIL_MODE` y `EMAIL_ALLOWLIST` (solo dev). Los `.env.*` no llevan secretos y se versionan; se puede dejar `.env.example`.

Despliegue (solo devops; los scripts los define devops, hardcodeados para que nunca se mezclen):
- dev: `firebase deploy --project dev --only functions:dev`
- prod: `firebase deploy --project prod --only functions:prod` (solo con confirmación de Carlos)

Barreras en el código (cada una evita un incidente concreto):
1. Al arrancar, un `assertEnv()` compara `APP_ENV` con el nombre del servicio (`K_SERVICE`, que en dev empieza con `dev-`). Si no coinciden, lanza error. Cubre el caso de desplegar `functions:prod` con `--project dev` (cargaría `.env.dev` en funciones de prod).
2. Si `APP_ENV !== "prod"` y la base es `(default)`, lanza error; y a la inversa.
3. Si `APP_ENV !== "prod"` y `FLOW_BASE_URL` no es el sandbox, lanza error (y a la inversa en prod).
4. `FLOW_BASE_URL` y los nombres de secreto salen del mismo archivo `.env`; no hay manera de mezclar sandbox con producción en un solo ambiente.
5. En dev, los correos solo salen a direcciones de `EMAIL_ALLOWLIST` (el resto se registra y se descarta). Así una prueba no escribe a un cliente real.
6. Funciones programadas (`expireReservations`): en dev se despliegan con frecuencia baja o se desactivan (cada job cuenta para la cuota gratuita de Cloud Scheduler; verificar).

Secretos: nombres distintos en Secret Manager, con el sufijo del ambiente. Carlos los carga con `firebase functions:secrets:set NOMBRE` desde su terminal (D-013). Cada función enlaza solo los secretos de su ambiente; para eso `defineSecret` debe recibir el nombre según `APP_ENV` (punto 5 de "no verificado"; si no se puede, plan B: dos módulos de funciones, `src/dev.ts` y `src/prod.ts`, cada uno con `source`/`entry` propio; más archivos, pero sin magia).
- dev: `FLOW_API_KEY_SANDBOX`, `FLOW_SECRET_KEY_SANDBOX`, `GMAIL_APP_PASSWORD` (compartido con prod por ahora, porque es la misma cuenta; mitigado por la lista blanca de correos).
- prod: `FLOW_API_KEY_PROD`, `FLOW_SECRET_KEY_PROD`, `GMAIL_APP_PASSWORD`.
- Las credenciales de sandbox pegadas en el chat siguen pendientes de regenerar (D-013).

Webhooks de Flow: `urlConfirmation` y `urlReturn` las manda la propia función al crear el pago, así que el sandbox solo apunta a la función `dev-flowConfirm` y a la URL de `nutra-dev`. Aun si llegara un token de sandbox a la función de prod, `getStatus` con las claves de prod falla y la función lo rechaza (D-005), y el pedido no existe en la base de prod. Falta confirmar si Flow también guarda una URL por defecto en la cuenta (punto 8 de "no verificado"): si existe, no debe apuntar a prod en la cuenta sandbox.

### 1.5 Auth compartido
- En el MVP no hay cuentas de cliente (D-015): **Auth contiene solo administradores**. Eso reduce mucho el problema.
- El claim `admin: true` es por usuario, no por ambiente: quien es admin en dev lo es en prod. Es aceptable porque son las mismas personas, y cada backend solo lee su propia base. Si más adelante hace falta separar, se agrega un claim `envs: ["dev","prod"]` (no lo recomiendo hoy).
- Pruebas: no crear usuarios "cliente" de prueba (contaminarían el Auth de prod). El checkout se prueba como invitado (D-015). Las pruebas de rol se hacen en el emulador, donde el Auth es local. Para probar el admin en dev se usa la cuenta real de Carlos.
- Dominios autorizados: agregar el dominio `*.hosted.app` de `nutra-dev`; `nutraelements.cl` solo cuando se publique.
- La función que asigna el claim (`setAdmin`) existe en ambos ambientes; en prod solo se ejecuta por un script de devops con confirmación.
- Si más adelante se habilita Auth con cuentas de cliente, el aislamiento deja de ser aceptable y debe reevaluarse (identity platform multi-tenant o un proyecto aparte).

### 1.6 App Check
- La aplicación de App Check (enforcement) en Firestore, Storage y Functions es por servicio del proyecto, no por base. Al activarla en prod también afecta a dev: `web-dev` debe tener su propio proveedor reCAPTCHA y tokens de depuración. Se registran dos apps web (`web-dev`, `web-prod`).

## 2. Alternativas evaluadas

### A. Solo Emulator Suite local, más un backend de preview con datos de dev
Se parece mucho a la recomendada: el backend de preview necesita una base de datos de dev (la base con nombre), funciones de dev para Flow sandbox (el emulador no puede recibir un webhook de Flow sin túnel) y secretos de dev. Lo único que se ahorra es no tener un backend permanente. **No es más simple**; es la recomendada con menos pasos de despliegue. Conclusión: el Emulator Suite es el ambiente de trabajo diario (ya lo exige AGENTS.md) y `nutra-dev` es el ambiente de integración (SSR real, App Check real, Flow sandbox real). Si Carlos prefiere ahorrar, puede crear `nutra-dev` más tarde y partir solo con emulador, pero entonces Flow sandbox no se prueba de punta a punta antes de prod.

### B. Prefijos en una sola base (colecciones `dev_orders`)
Descartada: las reglas, los índices y los triggers quedan mezclados, y un error de prefijo escribe pedidos falsos en la misma colección que las métricas reales.

### C. Un solo backend, con la rama como único separador
Descartada: no hay dev sin tocar prod.

## 3. Costo frente al presupuesto de 20 USD/mes
Estimación (orden de magnitud, sin verificar): el costo adicional de dev es de 0 a 2 USD/mes.
- Firestore y Functions: inactivos, sin costo; la capa gratuita se comparte (verificar).
- App Hosting: dos backends en Cloud Run con mínimo 0; cada rollout usa Cloud Build y Artifact Registry (centavos). Cada push a develop genera un build: hay que acotar la frecuencia.
- Secret Manager: unos 4 a 6 secretos más; se cobra por versión activa sobre las gratuitas (verificar).
- Cloud Scheduler: un job extra por la expiración de reservas (verificar la cuota gratuita).
- Storage: bucket de dev casi vacío.
- Recordar: el presupuesto solo avisa, no corta. Alertas al 25, 50, 90 y 100 por ciento, y una alerta adicional baja si se puede filtrar por servicio.

## 4. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| Desplegar a prod por error | Alias `dev` por defecto en `.firebaserc`; scripts de deploy fijos; rollout manual en `nutra-prod`; protección de rama en `main`; solo devops con confirmación |
| Funciones de dev escriben en la base de prod (olvidar `database`) | Constante única de base por ambiente; `assertEnv()`; test que revisa que ningún trigger omita `database` |
| Webhook de Flow sandbox llega a prod | URLs enviadas por la propia función; `getStatus` con claves del ambiente; pedido inexistente en prod |
| Correos reales desde dev | Lista blanca en dev |
| Auth compartido | Solo admins en el MVP; sin cuentas de prueba |
| Reglas de dev divergen de prod | Mismo archivo para ambas bases |
| Costos sorpresa | Mínimo 0 instancias, `maxInstances` bajo, scheduler reducido en dev, presupuesto con alertas |
| Escritura accidental por cuenta de servicio compartida | Aceptado en el MVP; endurecimiento posterior con cuentas de servicio por ambiente |
| App Check en prod bloquea a dev | App web y proveedor propios para dev |
| Región: App Hosting puede no estar en Santiago | Sigue sin verificar (D-010); decidir antes de crear `(default)` |

## 5. Ajuste del modelo de datos por la planilla (33 productos en cápsulas)
Cambios respecto al borrador del handoff anterior (sigue siendo borrador hasta ser contrato):
- `products/{sku}`: el **ID del documento y `sku` son un string** con la columna ID de Control Farma (D-016), por ejemplo `"2427844"`. Siempre texto, nunca número, para no perder ceros ni precisión al leer el Excel. La carga masiva por SKU es una búsqueda directa por ID.
- `barcode`: string con CODIGO_BARRA tal cual; `barcodeValid`: booleano calculado al importar (dígito verificador GTIN-8/12/13/14); `gtin`: solo se completa si el código es válido y **no** empieza con 978 o 979 (rango ISBN). El JSON-LD usa `gtin` y omite el campo si no existe. Los 978 se listan en el reporte para que Carlos confirme.
- `sourceName`: NOMBRE original en mayúsculas, solo lectura (D-018). `name`: nombre para mostrar, editable; al importar se propone un texto en formato título que el admin corrige.
- `stock`: entero >= 0. Un -5 o vacío se guarda como 0 (D-018). El reporte de importación registra las filas corregidas en `imports/{importId}` (`rows`, `corrected[] {sku, field, from, to}`, `createdBy`, `createdAt`), solo lectura para admin.
- `price`: PRECIO_VENTA_PUBLICO como entero CLP.
- `active`: de ACTIVO (SI=true). **Además `published`: false** al importar. Un producto solo se publica si tiene categoría, slug, descripción y al menos una imagen; la verificación va en la Function/regla de publicación. Así los 33 productos importados no salen al catálogo (ni al sitemap) incompletos. La consulta pública del catálogo usa `active == true && published == true`.
- `brand`: "Nutra Elements" como constante (LABORATORIO es siempre NUTRA ELEMENTS; no hace falta guardarlo por producto, y la marca va en el JSON-LD).
- Presentación: `format: "capsulas"` y `unitsPerPack` (30, 60, 90 o 120), extraídos del nombre al importar cuando es posible (`X 90`) y corregibles en el admin. `family` (por ejemplo `citrato-de-magnesio`) agrupa los tamaños de un mismo producto para mostrarlos juntos; cada tamaño sigue siendo su propio producto con su SKU (planilla). Sin variantes dentro de un producto.
- `slug`: único, lo genera el admin o se propone desde el nombre. Se valida la unicidad en la Function de publicación (con 150 productos basta una consulta).
- `source: "controlfarma-xls"`, `importedAt`, `updatedAt`.
- Índices: `products (active, published, category)` y `products (published, family)`. Consultas "sin stock": `stock == 0` sobre `published == true`. Se confirman cuando se escriba el contrato.
- La importación es idempotente por SKU: reimportar actualiza precio y stock, y nunca pisa `name`, `description`, `images`, `slug`, `category` ni `published`. Formato `.xls` antiguo: la librería de lectura se elige al implementar (no verificada).
- Los datos de la planilla no se versionan (D-017). En dev se siembra con una copia local no versionada o con datos ficticios.

## 6. Cambio propuesto a AGENTS.md (lo aplica el tech-lead)

Sección Stack, línea "Pagos":
> - Pagos: Flow (sandbox en dev, producción en prod), integrado mediante Cloud Functions

Sección Stack, línea "Entornos" (reemplazar):
> - Entornos: un solo proyecto de Firebase (`nutraelements`, alias `dev` y `prod` en .firebaserc apuntando al mismo proyecto). La rama develop es dev y main es prod. Cada ambiente tiene su propia pila: backend de App Hosting (`nutra-dev` y `nutra-prod`), base de Firestore (`nutra-dev` y `(default)`), bucket de Storage, codebase de Functions (`dev` con prefijo `dev-`, y `prod`), secretos con sufijo (`_SANDBOX` y `_PROD`) y app web con su App Check. Auth es compartido (solo administradores). El código valida el ambiente al arrancar. En local, siempre el Emulator Suite.

Sección Comandos (reemplazar "Despliegue a desarrollo"):
> - Despliegue de funciones a dev: `firebase deploy --project dev --only functions:dev` (solo devops)
> - Reglas e índices a dev: `firebase deploy --project dev --only firestore,storage` (solo devops; ver contrato por base y bucket)
> - Despliegue de la app a dev: push a develop (rollout automático de `nutra-dev`)
> - Producción: `firebase deploy --project prod --only functions:prod` y `firebase apphosting:rollouts:create nutra-prod --git-branch main` (solo devops, con confirmación explícita del usuario)

Flujo, paso 6 y reglas 5 y 6: cambiar "proyecto dev" y "proyecto prod" por "ambiente dev" y "ambiente prod". Agregar regla: "Todo acceso a Firestore y Storage pasa por el módulo de configuración de ambiente; nunca se usa `getFirestore()` ni un bucket sin nombre explícito."

Aviso: los comandos con `--only firestore,storage` y el nombre del backend dependen de los puntos 1 y 4 de "no verificado"; devops debe probarlos con `--dry-run` en dev antes de fijarlos en AGENTS.md.

## 7. Preguntas para Carlos
1. ¿Aceptas que `develop` despliegue solo a `nutra-dev` y que `nutra-prod` tenga rollout manual con tu confirmación? (Evita desplegar a prod por error.)
2. ¿Aceptas que Auth sea compartido y solo contenga administradores durante el MVP, sin cuentas de cliente de prueba?
3. ¿Subes el proyecto a Blaze? Sin eso no se puede crear ninguna de las dos pilas, ni comprobar las regiones de App Hosting.
4. ¿Región de Firestore y Storage? Depende de la región de App Hosting; hay que verificarla antes de crear `(default)`. Dev usa la misma.
5. Gmail: ¿la misma cuenta y la misma contraseña de aplicación para dev y prod (con lista blanca de destinatarios en dev), o una cuenta de pruebas aparte? ¿Qué correos entran en la lista blanca?
6. Endurecimiento: ¿cuentas de servicio separadas por ambiente desde ya (más seguro, más trabajo) o después del lanzamiento?
7. ¿Quién crea el bucket `nutraelements-dev` y la base `nutra-dev` (devops, tras tu aprobación y el paso a Blaze)?
8. ¿Confirmas el ID `nutra-dev` para la base y `nutraelements-dev` para el bucket?
9. Planilla: ¿hay otros libros ISBN (978) que sí sean códigos reales? ¿Confirmas que el SKU es la columna ID también en los Excel de precio y stock (D-016)? ¿Los 33 productos se publican todos al lanzamiento?

## 8. Qué necesito de otros agentes
- tech-lead: aplicar el texto de AGENTS.md, registrar en DECISIONS.md (propuesta D-019: un proyecto, dos pilas), y actualizar las tareas 0.6 y 0.9 del PLAN (alias `dev` y `prod` al mismo proyecto; no existen `nutra-elements-dev`/`prod`). Esto reemplaza la sección 6 del handoff anterior.
- devops: tras la aprobación y Blaze, crear los backends, la base, el bucket y los secretos vacíos; probar `--dry-run`; rollouts manuales; protección de rama; presupuesto con alertas. Verificar los puntos 1, 4 y 6 de "no verificado".
- nextjs-frontend: acceso a Firestore y Storage solo por el módulo de ambiente (`NEXT_PUBLIC_FIRESTORE_DB_ID`, `NEXT_PUBLIC_STORAGE_BUCKET`, `NEXT_PUBLIC_FUNCTIONS_PREFIX`); noindex en dev.
- seo-specialist: dev no indexable; sin proteínas ni creatina en el borrador de categorías (planilla).
- qa-reviewer: revisar las barreras `assertEnv`, que ningún trigger omita `database`, y los tests de reglas ejecutados contra una base con nombre.
