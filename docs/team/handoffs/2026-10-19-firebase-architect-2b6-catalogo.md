# Handoff firebase-architect — 2B.6 Funciones del catálogo (admin)

Fecha: 2026-10-19. Sin emuladores, sin deploy y sin git (D-026, D-031). No se tocaron contratos, reglas, índices, `functions/src/admin/` ni `functions/src/triggers/`.

## Verificación (en `functions/`)
- `npm run build`: OK, sin errores.
- `npm run lint`: OK, sin avisos.
- `npm test`: **16 archivos, 441 tests, todos pasan** (el total incluye lo de `common/` y lo que agregó el otro agente en `admin/` y `triggers/`). De ellos, `src/catalog/`: **6 archivos, 202 tests**.
- Extra: `npx tsc -p tsconfig.json --noEmit` (incluye los tests) sin errores.

## Qué hay en `functions/src/catalog/`
Callables v2 (`callables.ts`, exportados en `index.ts`): `importCatalog`, `importPrices`, `importStock`, `applyDiscount`, `setProductsPublished`, `createProduct`, `updateProductCommerce`, `deleteProducts`, `restoreProducts`. Todos:
- `assertAdmin` + `callableSecurityOptions()` (App Check exigido salvo `APP_ENV=local`), región `us-east4` por `setGlobalOptions`.
- Memoria, timeout y `maxInstances` de la tabla del contrato (importCatalog 512 MiB / 120 s; lotes 256 MiB / 60 s; createProduct y updateProductCommerce 30 s; todos `maxInstances: 2`).
- Validación con zod (request `strict`), errores del contrato y `toHttpsError` en el `catch` externo.

Estructura (para mantenerlo):
- Lógica pura y testeada: `cells.ts` (SKU, precio, stock), `barcode.ts` (GTIN), `names.ts` (nombre/familia/formato propuestos), `discount.ts` (descuento, cambio de precio), `product.ts` (lectura defensiva), `prepare.ts` (SKU inválidos y repetidos de todo el archivo), `plan-import.ts` (catálogo, precios, stock), `plan-discount.ts`, `plan-publish.ts`, `plan-delete.ts`, `report.ts` (`BatchReport`, recorte a 500), `writes.ts` (operación -> datos del documento).
- `runner.ts`: una transacción por trozo de **200 productos**, auditoría en `imports` y lote parcial.
- `store.ts` (puerto), `firestore-store.ts` (Admin SDK, **única parte que toca Firestore**) y `testing/memory-store.ts` (almacén en memoria de los tests; excluido del build en `tsconfig.build.json`).
- `handlers.ts`: la lógica de cada callable, separada de `onCall` para probarla.

## Firmas exactas para nextjs-frontend
Cliente: `httpsCallable(functions, "<nombre>")`, región `us-east4`. Todos requieren sesión con claim `admin: true`.

```ts
type Cell = string | number | null;

interface InvalidRow { row: number; sku?: string; code: string; message: string }
interface CorrectedCell { row: number; sku: string; field: string; from: Cell; to: Cell }
interface Warning { sku?: string; code: string; message: string }
interface PlannedChange { row: number; sku: string; name: string; field: 'price'|'stock'|'discount'|'create'; from: Cell; to: Cell }

interface BatchReport {
  importId: string | null;        // null en dryRun
  dryRun: boolean;
  rows: number;                   // filas (o SKU) recibidos
  created: number; updated: number; unchanged: number;
  skipped: number;                // = total de filas inválidas (aunque la lista se recorte)
  corrected: CorrectedCell[];     // <= 500
  invalid: InvalidRow[];          // <= 500, ordenadas por fila
  warnings: Warning[];            // <= 500
  truncated: boolean;
  changes: PlannedChange[];       // EXTENSIÓN aditiva (ver decisión 7): <= 500, para la vista previa
}

// Opciones comunes a los lotes. dryRun: valida y devuelve el reporte sin escribir ni crear imports.
// fileName: texto de 0 a 200 caracteres, solo para mostrar.
interface BatchOptions { dryRun?: boolean; fileName?: string }

importCatalog:           { rows: { ID?, NOMBRE?, CODIGO_BARRA?, STOCK_ACTUAL?, PRECIO_VENTA_PUBLICO?, ACTIVO?, LABORATORIO?: Cell }[] } & BatchOptions   -> BatchReport   // 1..1000 filas
importPrices:            { rows: { SKU?, PRECIO?: Cell }[] } & BatchOptions                                                                               -> BatchReport   // 1..1000
importStock:             { rows: { SKU?, STOCK?: Cell }[] } & BatchOptions                                                                                -> BatchReport   // 1..1000
applyDiscount:           { skus: string[]; discount: { type: 'percent'|'fixed'; value: number } | null } & BatchOptions                                   -> BatchReport   // 1..150 (discount es obligatorio; null = quitar)
setProductsPublished:    { skus: string[]; published: boolean } & BatchOptions                                                                            -> BatchReport   // 1..150
deleteProducts:          { skus: string[] } & BatchOptions                                                                                                -> BatchReport   // 1..200
restoreProducts:         { skus: string[] } & BatchOptions                                                                                                -> BatchReport   // 1..200

createProduct:           { sku: string; name: string; price: number; stock: number; barcode?: string }  -> { sku: string; created: boolean }
updateProductCommerce:   { sku: string; price?: Cell; stock?: Cell }                                     -> { sku: string; price: number; finalPrice: number; stock: number; discountRemoved: boolean }
```
- `row` de una fila inválida: en las hojas es el número de fila de la hoja (1 = encabezado, así que la primera fila de datos es la 2). En las listas de SKU es la posición en la lista, desde 1.
- Las columnas extra dentro de una fila se ignoran; una celda debe ser texto (<= 500 caracteres), número finito o `null`. Campos desconocidos en el nivel superior del request dan `INVALID_INPUT`.
- `stock` en `updateProductCommerce` y en `createProduct`: en `createProduct` es entero 0..1.000.000; en `updateProductCommerce` es el stock **físico** y la respuesta trae el **disponible** guardado (`físico - reservado`).

### Códigos
- **Errores globales** (`HttpsError`, `details.code`): `INVALID_INPUT` (con `fields`), `EMPTY_BATCH` y `TOO_MANY_ROWS` (`invalid-argument`), `UNAUTHENTICATED`, `NOT_ADMIN`, `APP_CHECK_FAILED`/error del SDK, `INTERNAL`. Solo en las funciones de un producto: `SKU_NOT_FOUND` (`not-found`), `SKU_EXISTS`, `PRODUCT_DELETED` (`failed-precondition`), `INVALID_PRICE`, `INVALID_STOCK`, `EMPTY_STOCK` (`invalid-argument`).
- **Códigos de fila inválida** (`invalid[].code`): `INVALID_SKU`, `DUPLICATE_SKU`, `SKU_NOT_FOUND`, `PRODUCT_DELETED`, `INVALID_PRODUCT_DATA` (documento dañado; **código nuevo**), `INVALID_NAME`, `INVALID_PRICE`, `INVALID_STOCK`, `EMPTY_STOCK`, `INVALID_ACTIVE`, `DISCOUNT_TOO_HIGH`, `ALREADY_DELETED`, `NOT_DELETED`, y los de publicación `NOT_ACTIVE`, `MISSING_NAME` (**nuevo**), `MISSING_SLUG`, `INVALID_SLUG`, `DUPLICATE_SLUG`, `MISSING_DESCRIPTION`, `INVALID_CATEGORY`, `MISSING_IMAGE`.
- **Advertencias**: `DISCOUNT_REMOVED`, `LABORATORY_MISMATCH`, `BARCODE_ISBN_RANGE`, `BARCODE_TOO_LONG` (**nuevo**), `PARTIAL_FAILURE` (**nuevo**, solo en el registro de `imports` de un lote interrumpido).
- En publicación, `code` es el primer problema y `message` lista todos ("No se puede publicar: falta el slug; falta la descripción; ...").

## Decisiones (cuando el contrato era ambiguo)
1. **Excel: filas JSON.** El contrato (5, intro) ya fija que el navegador lee el archivo y manda filas crudas. No hay librería de Excel en Functions ni se tocó `package.json`.
2. **Validación en dos pasos.** Primero, para todo el archivo, SKU inválidos y repetidos (así `DUPLICATE_SKU` vale entre trozos de 200). Después, por trozo, dentro de la transacción (lecturas con `getAll`, decisión pura, escritura). El planificador se vuelve a ejecutar completo si la transacción se reintenta; así no hay efectos dobles (probado con un reintento simulado).
3. **`dryRun`** usa transacciones de solo lectura de Firestore: no escribe, no crea `imports` y devuelve `importId: null`.
4. **Auditoría (`imports`)** se guarda al final, **fuera** de la transacción de los productos: no es atómica con ellos. Si un trozo falla después de haber aplicado otros, se guarda un registro parcial con `PARTIAL_FAILURE` y se relanza el error. Repetir el lote es seguro (cada fila es idempotente por SKU; probado).
5. **Auditoría para `createProduct` y `updateProductCommerce`**: el contrato pide `imports` para toda operación, pero `kind` no tenía valores para ellas. Escribo `kind: "create"` y `kind: "update"` (`rows: 1`). Solo se registra si algo cambió (no en `created: false` ni sin cambios). **Pedido al tech-lead: agregar `create` y `update` a `imports.kind` en data-model.md 2.7** (los lotes de eliminar/restaurar ya usan `delete`/`restore`).
6. **Cambios de contrato mínimos y aditivos** (frontend puede ignorarlos): `changes` en `BatchReport` (vista previa; el prototipo del admin ya lo usa; no se guarda en `imports`), `discountRemoved` en la respuesta de `updateProductCommerce`, y los códigos nuevos marcados arriba. **Tech-lead: aprobar o pedir que se quiten.**
7. **Números más estrictos que el prototipo** (`src/lib/admin/batch.ts` no se modificó): `"1,000"` y `"1,5"` son inválidos (ambiguos); `"1.000"` en una celda de **stock** vale 1000 (miles chilenos), no 1 como en el prototipo; `-0` no se guarda. El prototipo y el servidor pueden divergir en esos bordes: el servidor manda.
8. **Publicación**: el slug es único frente a otros productos **vigentes** (los eliminados no cuentan, porque no se sirven); si dos productos ya comparten slug en la base, ninguno puede publicarse hasta cambiar uno. Una categoría debe existir y estar `published`. Una imagen vale si su `path` empieza con `products/{sku}/`, no contiene `..` y su `alt` tiene 1 a 140 caracteres. Publicar lo ya publicado, o despublicar lo ya despublicado, es `unchanged` sin revisar las condiciones.
9. **Eliminar/restaurar** solo leen `deletedAt` (funcionan aunque otros campos del documento estén dañados). Un producto cuyos otros campos están dañados (precio no entero, etc.) se rechaza en los demás lotes con `INVALID_PRODUCT_DATA` y no se toca.
10. **Datos antiguos sin `deletedAt`**: al actualizar un producto que no trae el campo, se escribe `deletedAt: null, deletedBy: null` (la consulta pública `deletedAt == null` solo los encuentra así). No es la migración completa: los productos que ningún lote toque siguen sin el campo.
11. **Nombre propuesto al crear** (`importCatalog`): formato título ("CITRATO DE MAGNESIO X 120 CAPS" -> "Citrato de Magnesio x 120 cápsulas", máx. 120). `unitsPerPack` (1..1000), `format: "capsulas"` y `family` salen de "X n [CAPS]"; si no hay "X n" quedan `null`. Es solo una propuesta.
12. **Reimportación**: no escribe si nada cambió (ni `importedAt`), así repetir la planilla da `unchanged`. Sí actualiza `sourceName`, `barcode`, `barcodeValid`, `gtin` y `active` cuando difieren.
13. **`AuthRequestLike` no acepta `CallableRequest` tal cual** (tipo débil con una sola clave opcional; el contrato 2B.3 decía que sí, pero no se había compilado contra un `onCall`). El otro agente lo rodeó en `admin/callables.ts`; yo lo rodeé igual en `catalog/callables.ts` (`authOf`, que extrae solo el claim `admin`). No toqué `common/auth.ts`. **Sugerencia al tech-lead**: arreglar el tipo en `common/auth.ts` (`token?: { admin?: unknown; [key: string]: unknown }`) y quitar los dos rodeos.
14. **Errores del catálogo en `catalog/errors.ts`**, no en `common/errors.ts`, para no pisar el archivo que comparte el otro agente. Si el tech-lead prefiere un solo catálogo, es mover 8 entradas.
15. **`tsconfig.build.json`**: se agregó `src/**/testing/**` a `exclude` para que el almacén de memoria de los tests no vaya a `lib/` (cambio imprescindible mínimo; `package.json` sin cambios).
16. **`functions/src/index.ts`** exporta `catalog`, `admin` y `triggers` con `export *`. Las dos carpetas ya tenían `index.ts` del otro agente; el build compila con ellas.

## Sin verificar (requiere Firestore real o emulador)
Todo lo de `firestore-store.ts` (única parte que habla con el Admin SDK) y lo que depende de él:
- Que `t.getAll(...refs)` dentro de `runTransaction` devuelva los documentos como se espera, y que `readOnly: true` funcione en `dryRun`.
- La consulta de unicidad del slug dentro de una transacción (`where("slug","==",...)`, límite 10), que usa el índice automático de un solo campo.
- `t.create` (falla si el SKU apareció entre la lectura y la escritura) y `t.update` con `FieldValue.serverTimestamp()`.
- Concurrencia real: dos `deleteProducts` simultáneos sobre el mismo SKU. Los tests usan un almacén en memoria que serializa las transacciones; el bloqueo optimista de Firestore es lo que lo garantiza en la nube.
- Que las reglas de `imports` permitan solo lectura al admin y que la escritura del servidor (Admin SDK, salta las reglas) llegue.
- Que `enforceAppCheck` con `APP_ENV=local` deje pasar sin token (igual que en 2B.3).
- Límites reales de tamaño: 1000 filas de `importCatalog` con 512 MiB y 120 s deberían sobrar, pero no se midió.
- Los callables se probaron solo en autorización y validación (`.run` con una sesión simulada); con sesión de admin y datos válidos piden el almacén real y eso no se ejecutó.

## Qué necesito de otros
- **tech-lead**: (a) aprobar las extensiones aditivas de la decisión 6, (b) agregar `create`/`update` a `imports.kind` (decisión 5), (c) decidir sobre el tipo `AuthRequestLike` y el catálogo de errores (13 y 14).
- **nextjs-frontend**: leer las firmas de arriba. Dos diferencias con el prototipo: el servidor devuelve `changes` y `importId` reales, y `applyDiscount`/`setProductsPublished` aceptan hasta 150 SKU (eliminar/restaurar, 200); el cliente parte la selección si es mayor. Los productos creados antes de D-029 sin `deletedAt` no aparecen en la tienda hasta que un lote los toque.
- **devops/qa**: antes de desplegar a prod hay que correr estas funciones contra el emulador de Firestore (hoy sin ejecutar, D-026) y, en staging, hacer una prueba de humo con 2 o 3 SKU.
