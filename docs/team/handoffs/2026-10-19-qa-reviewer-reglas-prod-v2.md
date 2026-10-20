# QA: reglas desplegadas y storage.rules (qa-reviewer, 2026-10-19, v2)

Volcado por el tech-lead: qa-reviewer no tiene herramienta de escritura.

## Veredicto
- `firestore.rules`: **APROBADO**. SHA-256 `01c07eaa436a43271c3a92dd4649f9282fa631780f6a8d39091ed05c929090d4`, idéntico a la release de prod (ruleset `0b3eb22a-...`). No hay que revertir.
- `storage.rules`: **APROBADO** para desplegar. SHA-256 `a65837abef6157326ad06a2e8073b7b83526de58ee9b7f1aa10f88dc791d4c31`; si cambia, QA debe revisarlo de nuevo.
- `isAdmin()` con `token.get('admin', false) == true`: no abre nada; no hay `!isAdmin()`.

## Hallazgos
- **I-1:** los tests de reglas no se ejecutaron. **Resolución del tech-lead:** riesgo aceptado explícitamente por Carlos en D-031; se ejecutan cuando haya Java.
- **I-2:** `typecheck:rules` falla por `functions/src/catalog/runner.ts` (TS2345, varianza de `BatchJob<T>`). Lo corrige el dueño de catalog antes del commit.
- **S-1:** el comentario de la línea 8 de `firestore.rules` es ambiguo. Se corrige en la próxima edición.
- **S-2:** el admin puede editar el contenido de un producto eliminado. **Resolución del tech-lead:** aceptado e intencional (se corrige antes de restaurar). Se documentará en el contrato v1.3.
