# Handoff devops: despliegue de Firestore en prod (2026-10-19)

## Resultado
Firestore `(default)` creado en `nutraelements` (prod), reglas e índices desplegados. Autorizado por Carlos (D-031). Sin git, sin tocar dev, sin Storage/functions/auth/App Hosting.

## ALERTA: firestore.rules cambió durante la tarea
- Verificación previa (antes del deploy): SHA-256 de `firestore.rules` = `dcefaf14a0d6259e95e27084c367c677bd880d6e3777b22c3a9b3c10816a7c5f`.
- La fecha de modificación del archivo es 11:48:53 (hora local), es decir, **alguien lo modificó después de mi hash y ~1 minuto antes del deploy** (release a las 14:49:52Z = 11:49:52 local).
- Lo que se desplegó (leído de la API de Rules) = `01c07eaa436a43271c3a92dd4649f9282fa631780f6a8d39091ed05c929090d4`, igual al archivo actual (12086 bytes).
- Es probable que no sea la versión que qa-reviewer aprobó. El tech-lead debe comparar con el hash revisado por QA y, si difiere, pedir a qa-reviewer que revise el diff. Si no se aprueba, revertir (ver rollback).
- `firestore.indexes.json` SHA-256 = `8b924e70ea5d19a366823c4fa12cc0b3702672b0518fee8dd5f40ac07dc573a5` (sin cambios).

## Evidencia
- `firebase.json`: `firestore.database = "(default)"`, `location = "us-east4"`. Verificado antes.
- `firebase deploy --only firestore --project prod --non-interactive`: habilitó `firestore.googleapis.com`, "Creating the new Firestore database (default)", rules compiladas sin errores, "deployed indexes ... successfully", "released rules firestore.rules to cloud.firestore". Sin preguntas destructivas ni de ubicación.
- `firebase firestore:databases:get "(default)" --project prod`: Type FIRESTORE_NATIVE, Location us-east4, Edition STANDARD, Delete protection DISABLED, PITR DISABLED, retención de versiones 3600s, creada 2026-10-19T14:49:10Z.
- `firebase firestore:indexes --project prod`: 10 índices compuestos (4 orders, 6 products... ver listado en la salida: orders x4, products x6) y 2 TTL (`idempotencyKeys.expiresAt`, `rateLimits.expiresAt`). La salida de la CLI no muestra estado; pueden estar aún en CREATING (se completan solos, base vacía).
- Release de reglas leída vía Firebase Rules API (token de la CLI): `projects/nutraelements/releases/cloud.firestore` -> ruleset `0b3eb22a-ae44-4dc5-83c2-9c6a2dc66287`, creada 2026-10-19T14:49:52Z; contenido con SHA-256 `01c07eaa...90d4` (coincide con el archivo local actual).

## Prueba manual como anónimo (SDK web, config de .env.local sin imprimir valores; proyecto = nutraelements)
Script fuera del repo (carpeta temporal de la sesión).
| Prueba | Esperado | Resultado |
|---|---|---|
| get `orders/x` | fallar | permission-denied (OK) |
| get `settings/private` | fallar | permission-denied (OK) |
| list `products` sin filtros | fallar | permission-denied (OK) |
| list `products` con published==true, active==true, deletedAt==null | funcionar | OK, 0 documentos (OK) |
| set `categories/test` | fallar | permission-denied (OK) |
Las 5 pruebas dieron el resultado esperado. No quedó ningún documento escrito.

## Rollback
- Reglas: consola Firebase > Firestore > Reglas > historial, volver a la release anterior (nota: al ser la primera release, no hay anterior; en ese caso desplegar un `firestore.rules` que niegue todo: `rules_version='2'; service cloud.firestore { match /databases/{d}/documents { match /{document=**} { allow read, write: if false; } } }`).
- Índices: se pueden borrar desde la consola (Firestore > Índices).
- La base y su ubicación (us-east4) no se revierten (irreversible, aceptado por Carlos).

## Pedidos al tech-lead
- Aclarar quién modificó `firestore.rules` a las 11:48 y hacer que qa-reviewer confirme la versión `01c07eaa...` (o que se revierta).
- Pendiente: Storage (falta bucket), functions, App Hosting. No se hizo nada de eso.
