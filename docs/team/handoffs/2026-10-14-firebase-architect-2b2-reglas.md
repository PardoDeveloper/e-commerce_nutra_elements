# Handoff firebase-architect — 2B.2 Reglas de seguridad, índices y tests de reglas

Fecha: 2026-10-14. Rama: develop. Sin commits ni deploy (de eso se encarga devops).

## Estado honesto
- **Las reglas y sus tests NO se han ejecutado** (D-026: sin emuladores ni Java). Tampoco se pudo validar la **sintaxis** de las reglas: el CLI no tiene un validador offline. Verificado solo por lectura y por compilación de los tests (`tsc`) y lint. El primer fallo de sintaxis aparecerá al correr el emulador. Nada sale a prod sin ejecutar `npm run test:rules` (regla 5 de AGENTS.md).

## Archivos
- `firestore.rules` (reglas reales, reemplaza el "todo denegado" de 2B.1).
- `storage.rules`.
- `firestore.indexes.json`: 9 índices compuestos de la sección 5 y TTL de `idempotencyKeys` y `rateLimits`.
- `functions/test/rules/`: `require-emulators.ts` (setup que falla con mensaje claro sin emuladores), `helpers.ts`, `firestore.rules.test.ts`, `storage.rules.test.ts`.
- `functions/package.json`, `functions/package-lock.json`: devDependencies `@firebase/rules-unit-testing@6.0.0` y `firebase@13.0.0` (peer requerido); scripts `test` (solo proyecto `unit`), `test:rules` (proyecto `rules`), `typecheck:rules`.
- `functions/vitest.config.mts`: dos proyectos (`unit` y `rules`). `functions/tsconfig.test.json` (nuevo, solo typecheck). `functions/README.md` (sección de tests de reglas).
- No toqué `functions/src/**`, la raíz de Next.js ni los contratos.

## Decisiones
- Perfiles de prueba: anónimo, autenticado sin claim, autenticado con `admin: false`, y admin. Más pruebas de token con `admin: "true"` (cadena): no es admin.
- TTL: **sí se puede declarar** en `firestore.indexes.json`. Confirmado leyendo el código de firebase-tools 15.34.0 (`lib/firestore/api.js`, `validateField`/`patchField`): `fieldOverrides[]` con `{collectionGroup, fieldPath, ttl: true, indexes: [...]}`. `indexes` es obligatorio; dejé los tres índices de un solo campo por defecto. Verificación real (dry-run contra un proyecto) pendiente de devops.
- Productos: el admin edita solo `name, description, shortDescription, categoryId, images, slug, format, unitsPerPack, family, seo, updatedAt` (`affectedKeys().hasOnly`). `updatedAt` es obligatorio y `== request.time`. Los campos se validan solo si cambian, para no bloquear ediciones por datos antiguos escritos por el servidor. Crear y borrar: nadie.
- `categoryId` usa `exists()` (única lectura extra, como pide el contrato).
- Categorías: crear y editar por el admin; `slug` y `createdAt` inmutables; `imagePath` debe ser `categories/{slug}/{archivo}`; nadie borra.
- `settings/public`: `get` público, `list` denegado (el contrato solo habla de ese documento). `settings/private`: solo `get` del admin. Cualquier otro documento de `settings`, denegado.
- `orders`, `metrics/**`, `imports`, `paymentEvents`: lectura solo admin, escritura nadie. `counters`, `idempotencyKeys`, `rateLimits`: nada, ni lectura del admin.
- Storage: el admin puede borrar (el contrato dice "escritura / borrado: solo admin"). Rutas `products/{sku}/{file}` y `categories/{slug}/{file}`; tipos `image/jpeg|png|webp`; `size <= 2 MiB` (2 MiB exactos pasa); nombre `^[A-Za-z0-9_-]{8,40}\.(jpg|jpeg|png|webp)$`; SKU con su regex.
- Las reglas se prueban con proyecto `demo-nutra-rules`, nunca uno real.

## Propuestas de cambio al contrato (no aplicadas; se decidió lo más restrictivo)
1. `settings/public.communes`: las reglas no recorren arreglos. Validan lista de 1 a 400 elementos, sin revisar `{code, name}`. Los límites 1..400 no están en el contrato. Propuesta: documentarlos. El servidor ya valida `communeCode`.
2. `settings/private.orderNumberStart`: añadí un máximo de 100.000.000 (el contrato solo dice ≥ 1). Propuesta: documentarlo.
3. `products.format`: el contrato dice "enum abierto"; las reglas piden string de 1 a 40 caracteres. Propuesta: documentar el máximo.
4. `settings/public` no admite `list` (solo `get`). Propuesta: aclararlo en la matriz.
5. El nombre del archivo en Storage no se contrasta con el `contentType` (un `.webp` con `image/png` pasa). Las reglas no ven el contenido; riesgo bajo, solo sube el admin.
6. El borrado de `products/{sku}` está denegado, pero el contrato (2.1, "se despublica") no indica cómo se elimina un SKU creado por error. Pregunta para el tech-lead: ¿función admin, o aceptar que no se borra?

## Pendientes y sin ejecutar
- **Sin ejecutar**: `npm run test:rules` (firestore y storage). Comando previsto: `firebase emulators:exec --only firestore,storage --project demo-nutra-rules "npm --prefix functions run test:rules"`. Sin emuladores falla con un mensaje claro (verificado: la salida pide los emuladores y muestra el comando).
- Sin verificar: sintaxis y semántica de las reglas en el emulador; que `ctx.storage()` use el bucket por defecto sin pasar `bucketUrl`; que `$(newField(...))` dentro de `exists()` sea aceptado; que el emulador de Storage haga cumplir `request.resource.size` y `contentType` con la API compat de `put`.
- Los índices no se validaron contra el CLI (sin dry-run).
- Para devops: los emuladores usan los puertos de `firebase.json`; `emulators:exec` necesita Java (no instalado; requiere autorización de Carlos).

## Verificación (en `functions/`)
- `npm run build`: OK, sin errores.
- `npm run lint`: OK, sin avisos.
- `npm test`: 7 archivos, 193 tests pasan (solo unitarios; incluyen los de otro agente en `src/`; los tests de reglas no se cargan).
- `npx tsc -p tsconfig.test.json --noEmit` (alias `npm run typecheck:rules`): OK, sin errores (compilan los tests de reglas).
- `npm run test:rules` sin emuladores: falla a propósito con "Los tests de reglas requieren los emuladores…".

## Tabla de cobertura: colección → regla → test
Archivo de tests: `F` = `functions/test/rules/firestore.rules.test.ts`, `S` = `storage.rules.test.ts`.

| Colección / ruta | Regla (contrato 3) | Test que la cubre |
|---|---|---|
| `products` lectura | público solo `published && active`; consulta con ambos filtros; admin todo | F `products como <perfil>` (lee publicado; no lee borrador ni inactivo; lista con filtros; falla sin filtros o con uno solo) y `products como admin` (lee y lista todo) |
| `products` crear/borrar | nadie | F `no crea, ni edita… ni borra` (3 perfiles) y `no crea ni borra productos` (admin) |
| `products` actualizar (público) | negado | F `no crea, ni edita (precio, stock, nombre)` (3 perfiles) |
| `products` actualizar (admin) | solo contenido + `updatedAt == request.time` | F `edita campos de contenido…`, `permite poner… en null`, `falla si updatedAt falta o no es la hora del servidor` |
| `products` campos del servidor | `price, discount, finalPrice, stock, reserved, inStock, active, published, sku…` prohibidos | F `it.each` de 16 campos y `falla si mezcla contenido con precio o stock` y `no puede reemplazar el documento completo con set` |
| `products` validación de tipos | name, textos, images ≤ 8, unitsPerPack, family, seo, categoryId existente | F `valida nombre, textos, imágenes…`, `cambia la categoría…` |
| `products.slug` | inmutable si publicado; formato | F `no cambia el slug de un producto publicado…`, `valida el formato del slug…` |
| `categories` | lectura pública solo publicadas; admin crea/edita con validación; slug inmutable; nadie borra | F `categories como <perfil>`, `categories como admin` (crea, rechaza inválidos, campo faltante, edita, inmutables, no borra) |
| `orders` | solo admin lee; nadie escribe; RUT no legible | F `orders como <perfil>` (get, list, consultas por RUT/correo/token, collectionGroup, crear con precio manipulado, editar, borrar) y `orders como admin` (lee; no escribe `paymentStatus`, `refund`, `statusHistory`, `total`) |
| `counters` | nadie, ni lectura | F `counters como <perfil>` (4 perfiles incluido admin) |
| `settings/public` | lectura pública; admin escribe con validación; no borra | F `settings como <perfil>`, `settings/public como admin` |
| `settings/private` | solo admin; validación; resto de `settings` denegado | F `settings como <perfil>`, `settings/private como admin` |
| `metrics/**` | admin lee; nadie escribe | F `metrics/daily/days…` y `metrics/products/items…` (3 perfiles + admin) y `metrics: … más vendidos` |
| `imports` | admin lee; nadie escribe | F `imports/imp1…` (3 perfiles + admin) |
| `paymentEvents` | admin lee; nadie escribe | F `paymentEvents/tok1…` (3 perfiles + admin) |
| `idempotencyKeys`, `rateLimits` | nadie, ni admin | F `idempotencyKeys y rateLimits como <perfil>` |
| Ruta no declarada | negada | F `ruta no declarada como <perfil>` (incluye subcolección bajo `products`) |
| Escalada | claim solo con `admin == true` | F `escalada de privilegios` (usuario sin claim; `admin: "true"`) y S último test |
| Storage lectura | pública solo `products/**` y `categories/**` | S `lectura` |
| Storage escritura | solo admin, imagen ≤ 2 MiB | S `escritura como <perfil>` (sin claim) y `escritura como admin` (WebP válido, JPEG/PNG, 2 MiB exactos pasa y +1 byte falla) |
| Storage tipo y nombre | tipos permitidos y patrón de archivo/SKU/slug | S `rechaza tipos…` (svg, gif, pdf, html, octet-stream), `rechaza nombres…`, `rechaza SKU fuera del patrón…` |
| Storage rutas | otras rutas negadas | S `rechaza rutas no declaradas`, `borra… no rutas no declaradas`, `lectura … rutas no declaradas` |

## Qué necesito de otros
- tech-lead: decidir las 6 propuestas de arriba (especialmente la 6: borrado de productos). Autorizar emuladores (y Java) para ejecutar `test:rules` antes del primer despliegue.
- devops: al commitear, incluir `functions/package-lock.json` y `functions/test/`. Antes de desplegar índices, hacer un dry-run del TTL en dev (`firebase deploy --only firestore:indexes --project dev`, solo con aprobación).
