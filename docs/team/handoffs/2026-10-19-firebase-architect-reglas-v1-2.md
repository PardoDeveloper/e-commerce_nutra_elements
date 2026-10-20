# Handoff firebase-architect — Reglas, índices y tests v1.2 (D-027 y D-029)

Fecha: 2026-10-19. Sin deploy, sin git, sin emuladores (D-026).

## Archivos cambiados
- `firestore.rules`
- `firestore.indexes.json`
- `functions/test/rules/firestore.rules.test.ts`

No se tocaron `functions/src/**`, `src/`, contratos ni `storage.rules`.

## Qué se hizo
- **Reglas**: la lectura pública de `products` exige ahora `published == true && active == true && deletedAt == null` (el admin lee todo). `deletedAt` y `deletedBy` no están en `productContentKeys()`: ni el admin los escribe. `create` y `delete` siguen en `false`. Si el documento no trae `deletedAt`, la regla deniega (comportamiento deseado, ver contrato). Las validaciones de D-027 ya estaban aplicadas y coinciden con la v1.2: `communes` 1 a 400, `orderNumberStart` 1 a 100.000.000, `format` 1 a 40, `settings/public` solo `get`. No hubo que cambiarlas.
- **Índices** (reemplazo, sin conservar los viejos): `published,active,deletedAt,name`; `published,active,deletedAt,categoryId,name`; `published,active,deletedAt,family,unitsPerPack`; `published,stock` (sin cambio); `deletedAt,stock,name`; nuevo `deletedAt,name`. Los 4 índices de `orders` y los `fieldOverrides` TTL quedan igual.
- **Tests**: semillas de producto con `deletedAt: null, deletedBy: null`, más `P-DELETED` (publicado y activo, eliminado) y `P-OLD` (sin el campo `deletedAt`).

## Tabla colección -> regla -> test (filas actualizadas)

| Colección | Regla | Test |
|---|---|---|
| `products` (público) | get/list solo con `published && active && deletedAt == null` | "no lee un producto eliminado", "no lee un producto sin el campo deletedAt", "lista con los filtros ... deletedAt == null" (obtiene solo el vigente), "no lista ... filtros incompletos", "no lista los eliminados", "no puede eliminar ni restaurar por escritura directa" (grupos 1, 2, 3, 6) |
| `products` (admin lectura) | `isAdmin()` lee todo | "lee todos... lista sin filtros" (5 docs), "lee y lista productos eliminados" (grupo 4) |
| `products` (admin escritura) | solo `productContentKeys()`; `deletedAt`/`deletedBy` fuera | `it.each` de campos prohibidos (`deletedAt` serverTimestamp/null/cliente, `deletedBy` valor/null), "mezcla contenido con deletedAt/deletedBy", "falla al borrar los campos deletedAt y deletedBy" con `FieldValue.delete()`, "puede editar el contenido de un eliminado, pero no restaurarlo ni eliminarlo" (grupos 5 y 6) |
| `products.format` | 1 a 40 caracteres | test de validación (0 y 41 fallan, 40 pasa) |
| `settings/public` | `get` sí, `list` no; `communes` 1 a 400 | "settings/public: get sí, list no", 0 y 401 comunas fallan, 400 pasa |
| `settings/private` | `orderNumberStart` 1 a 100.000.000 | 0 y 100.000.001 fallan, 100.000.000 pasa |

Las demás filas de la tabla de `2026-10-14-firebase-architect-2b2-reglas.md` no cambian.

## Verificación (en `functions/`)
- `npm run build`: sin errores (tsc).
- `npm run lint`: sin errores (eslint).
- `npm test`: 7 archivos, 193 tests pasados (proyecto `unit`).
- `npm run typecheck:rules`: sin errores (tsc --noEmit).
- `firestore.indexes.json`: JSON válido (`node`: 10 índices, 6 de `products`).

## Sin ejecutar
Los tests de reglas (`npm run test:rules`) **no se ejecutaron**: requieren el emulador de Firestore y Java (D-026). Solo están verificados el tipado y el lint. Los conteos esperados (por ejemplo, 5 productos para el admin, 3 vigentes) y el rechazo de las consultas con `!=` hay que confirmarlos al primer arranque del emulador. Los índices tampoco se desplegaron.

## Notas e inconsistencias
- Un producto con `deletedAt` ausente no es legible para el público ni aparece en consultas `deletedAt == null`: los datos ya sembrados (demo, emulador) necesitan migración o resiembra, y `importCatalog`/`createProduct` deben escribir `deletedAt: null` (trabajo de `functions/src`, no hecho aquí).
- El Admin SDK salta las reglas: las lecturas del servidor (ISR) deben filtrar `deletedAt == null` y `published` por su cuenta.
- La regla no impone la invariante `deletedAt != null => published == false`: la garantiza el servidor.

## Qué necesito del tech-lead
- Encargar `deleteProducts`/`restoreProducts` y los ajustes de `createProduct`/`importCatalog` en `functions/src` (sin hacer todavía).
- Cuando haya Java y emuladores, autorizar la primera ejecución de `npm run test:rules`.
