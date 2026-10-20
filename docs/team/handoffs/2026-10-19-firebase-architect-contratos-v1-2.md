# Handoff firebase-architect — Contratos v1.2 (D-027 y D-029)

Fecha: 2026-10-19. Solo documentación: no se tocó código, reglas, índices, git ni emuladores. Archivos cambiados: `docs/team/contracts/data-model.md`, `docs/team/contracts/functions.md` y este handoff. Ambos contratos dicen ahora "v1.2 — D-027 y D-029 aplicadas (2026-10-19)".

## Cambios por sección

### data-model.md
- **2.1 `products`**: campos nuevos `deletedAt` (Timestamp | null, obligatorio, solo servidor) y `deletedBy` (uid | null, solo servidor), con la invariante `deletedAt != null` ⇒ `published == false`. Ejemplo y tipo TypeScript actualizados. La regla "un producto no se borra" se reemplazó por la eliminación lógica de D-029 (documento e imágenes se conservan, restaurar deja despublicado, un SKU eliminado no se revive). `format`: 1 a 40 caracteres. La lista de campos que solo escribe el servidor incluye ahora `deletedAt` y `deletedBy`.
- **2.5 `settings`**: `communes` 1 a 400 elementos; `orderNumberStart` 1 a 100.000.000; `settings/public` solo `get`, sin `list`.
- **2.7 `imports`**: nuevos `kind` `"delete"` y `"restore"`; sirven de registro de auditoría de las eliminaciones (el contrato no tenía otro registro de auditoría).
- **3 Matriz**: lectura pública de `products` exige `published && active && deletedAt == null`; el admin lee todo, incluidos los eliminados; el cliente (admin incluido) nunca escribe `deletedAt` ni `deletedBy`; `settings/public` solo `get`. Regla 3 y lista de tests (sección 9) ampliadas.
- **5 Índices**: reemplazo de índices (JSON del contrato ya actualizado), ver más abajo.
- Encabezado, lista de decisiones y tabla de la sección 1 actualizados.

### functions.md
- **2 Catálogo**: filas 22 `deleteProducts` y 23 `restoreProducts` (callable, admin + App Check, 256 MiB / 60 s / 2).
- **3.1 `createOrder`**: paso 3 trata un SKU eliminado como `PRODUCT_UNAVAILABLE`, igual que uno no publicado.
- **5 Reglas comunes de lotes**: regla general `PRODUCT_DELETED` (nunca se revive).
- **5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**: `PRODUCT_DELETED` en `importCatalog`, `importPrices`, `importStock`, `applyDiscount`, `setProductsPublished` y `updateProductCommerce` (como fila inválida o error). Añadí `createProduct`, que no estaba en tu lista, por coherencia: un SKU eliminado devuelve `failed-precondition` / `PRODUCT_DELETED`.
- **5.9 nueva**: `deleteProducts({skus})` y `restoreProducts({skus})`: máx. 200 SKU, `BatchReport` como los otros lotes, errores por fila `SKU_NOT_FOUND`, `ALREADY_DELETED`, `NOT_DELETED`, `DUPLICATE_SKU` (más `INVALID_SKU`), global `TOO_MANY_ROWS` (y `EMPTY_BATCH`), idempotencia por estado (no se pisan `deletedAt` ni `deletedBy` originales), auditoría vía `imports`.
- **8.1 Trigger**: `deletedAt` entra en los campos visibles; eliminar revalida ficha (que pasa a 404), categoría, listado, inicio y sitemap.
- **9 Tests**: nuevo bloque 12b (a a k) y autorización (13) incluye las dos funciones.
- **10 Frontend**: resumen de lo que necesita nextjs-frontend (abajo).

## Decisiones propias
- **Índices (D-029)**. Las consultas públicas ganan `where("deletedAt","==",null)`, y un índice compuesto debe contener todos los campos filtrados, así que **se reemplazan** (no se suman):
  - `published, active, name` pasa a `published, active, deletedAt, name`.
  - `published, active, categoryId, name` pasa a `published, active, deletedAt, categoryId, name`.
  - `published, active, family, unitsPerPack` pasa a `published, active, deletedAt, family, unitsPerPack`.
  - `stock, name` pasa a `deletedAt, stock, name` (sin stock, vigentes).
  - Nuevo `deletedAt, name` (lista normal del admin; opcional si el admin carga todo y filtra en cliente).
  - `published, stock` no cambia (un eliminado nunca está publicado).
  - El filtro "Eliminados" (`deletedAt != null`) usa el índice automático de un solo campo.
- **Campo obligatorio y explícito**: `deletedAt` debe existir con valor `null` en todo producto, porque `where("deletedAt","==",null)` no encuentra documentos sin el campo y la regla `resource.data.deletedAt == null` falla (deniega) si falta. Implica: `importCatalog` y `createProduct` lo escriben, y los datos ya creados (demo o emulador) necesitan migración o resiembra.
- **Auditoría** en `imports` con `kind` `delete` / `restore` (no se creó colección nueva).
- **`restoreProducts`** deja `published=false` siempre; `active` no se toca al eliminar.

## Cambio exacto pendiente en `firestore.rules` (NO aplicado)
En `firestore.rules`, línea 88 (función de lectura de producto), hoy:
`resource.data.published == true && resource.data.active == true`
debe pasar a:
`resource.data.published == true && resource.data.active == true && resource.data.deletedAt == null`
- El admin sigue leyendo todo. `productContentKeys()` no cambia: `deletedAt` y `deletedBy` NO se agregan (así el admin no puede escribirlos).
- Los `create`/`delete` de cliente siguen en `false`.

Tests a agregar en `functions/test/rules/firestore.rules.test.ts` (y actualizar las semillas de producto con `deletedAt: null, deletedBy: null`):
1. Público, autenticado sin claim y `admin:false` **no leen** (`get`) un producto eliminado (`deletedAt` Timestamp), aunque tenga `published:true` y `active:true`.
2. Público lista con `published==true`, `active==true`, `deletedAt==null` y obtiene solo vigentes; la misma consulta **sin** el filtro `deletedAt` falla (también con solo dos de los tres filtros).
3. Un producto sin el campo `deletedAt` (dato antiguo) no es legible públicamente.
4. Admin lee y lista productos eliminados (`where("deletedAt","!=",null)`) y vigentes.
5. Admin falla al escribir `deletedAt` y `deletedBy` (ponerlos, borrarlos, y mezclados con contenido válido); se agregan al `it.each` de campos prohibidos.
6. Admin no puede "restaurar" ni "eliminar" por escritura directa.
7. `settings/public`: ya cubierto `get` sí / `list` no; confirmar que el test existe tras D-027. Y `communes` de 0 y 401 elementos falla; `orderNumberStart` 100.000.001 falla; `format` de 0 y 41 caracteres falla.

También `firestore.indexes.json`: reemplazar los índices según la lista de arriba (cambio de código, pendiente).

## Inconsistencias encontradas (no corregidas)
- data-model.md 2.2: "Las categorías **no se borran** desde el cliente" se mantiene tal cual; no es contradictorio (es de categorías).
- Hay conflicto de naming con las decisiones: D-029 dice "fila inválida `PRODUCT_DELETED`" y lo documenté así, pero para `createProduct`/`updateProductCommerce` (operaciones de un solo producto) es un error `HttpsError`, no una fila. Está dicho en 5.6 y 5.7.
- Pedidos con reserva pendiente de un SKU que luego se elimina: la liberación o confirmación de stock sigue escribiendo en el documento eliminado. Es lo deseado, pero lo anoté en 5.9 para que se pruebe (test 12b-i).
- El servidor lee con Admin SDK en ISR; si alguna página pública lee por id (`/productos/[slug]` busca por `slug`), debe comprobar `deletedAt == null` y `published` además de la consulta: no lo cubren las reglas porque el Admin SDK las salta.
- La demo (D-028) usa datos simulados sin `deletedAt`; el tipo `ProductDoc` de `src/` y `src/lib/data` hay que actualizarlo.

## Qué necesita nextjs-frontend
- Tipo `ProductDoc` con `deletedAt` y `deletedBy`.
- Todas las lecturas de la tienda (servidor y cliente) filtran `deletedAt == null`; una ficha eliminada responde 404.
- Admin: checkbox por fila y "seleccionar todos" sobre la lista filtrada; diálogo con la cantidad (más de 5 exige escribir `ELIMINAR`); partir en lotes de 200; `deleteProducts` / `restoreProducts` con reporte por fila (`ALREADY_DELETED`, `NOT_DELETED`, `SKU_NOT_FOUND`, `DUPLICATE_SKU`); filtro "Eliminados" con "Restaurar" (vuelve despublicado); la lista normal excluye eliminados.
- Mostrar `PRODUCT_DELETED` como fila inválida en los reportes de importación.
- Capa de datos demo: simular las dos acciones hasta que existan las Functions.

## Qué necesito de otros
- tech-lead: aprobar los contratos v1.2 y encargarme la implementación: reglas y tests de arriba, `firestore.indexes.json`, funciones `deleteProducts`/`restoreProducts` y ajustes en las demás. Confirmar que los índices viejos se reemplazan (no se conservan).
- Siguen sin ejecutarse emuladores (D-026): nada de esto está verificado con tests; son solo contratos.
