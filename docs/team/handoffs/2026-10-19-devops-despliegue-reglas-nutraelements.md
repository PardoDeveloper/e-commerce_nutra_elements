# Despliegue de reglas e indices a nutraelements (prod)

Fecha: 2026-10-19. Agente: devops. Autorizacion: Carlos (D-030, D-031). QA: APROBADO con C1 a C3 (2026-10-19-qa-reglas-firestore-storage.md).

## Que hice
Solo reglas de Firestore, indices de Firestore y reglas de Storage en `nutraelements`. Sin Functions, App Hosting ni hosting. Sin commit, push, branch ni PR. No modifique archivos del proyecto (ni `.firebaserc` ni `apphosting.yaml`).

## Verificaciones previas
- `.firebaserc`: `prod` = `nutraelements`. Sesion activa (`firebase login:list`).
- `firestore.rules`, `storage.rules`, `firestore.indexes.json` en la raiz.

## Comandos
1. `firebase deploy --project nutraelements --only firestore:rules,firestore:indexes,storage` (un solo intento, sin errores).
2. `firebase firestore:indexes --project nutraelements`
3. curl sin credenciales (solo lectura).

## Salida relevante del deploy
- Storage: API firebasestorage ya habilitada; `storage.rules` compilo; "released rules storage.rules to firebase.storage".
- Firestore: `firestore.rules` compilo; "latest version of firestore.rules already up to date, skipping upload"; "released rules firestore.rules to cloud.firestore"; indices desplegados en (default). "Deploy complete!". No se habilito ninguna API nueva.

## C1 (reglas activas son las del repo)
Parcialmente confirmado por el CLI: la version de firestore.rules ya existente en la nube era identica al archivo del repo (ya estaba desplegada antes, ver handoff 2026-10-19-devops-deploy-firestore-prod.md), y se libero como ruleset activo. Storage subio y libero storage.rules del repo, reemplazando lo anterior. El CLI no tiene comando para imprimir el texto de las reglas activas. Respaldo funcional: el humo de seguridad dio 403 en todo. Recomendado (Carlos): mirar en la consola Firebase, Firestore > Reglas y Storage > Reglas, que no haya `request.time` de modo de prueba.

## C2 (indices y TTL)
- `firebase firestore:indexes` lista 10 indices (4 de orders, 6 de products) y fieldOverrides con `ttl: true` en `idempotencyKeys.expiresAt` y `rateLimits.expiresAt`. Coinciden con el repo.
- Estado de construccion (creando o listo): el CLI no lo muestra. Se desplegaron hace instantes, asumir "creando" hasta revisar la consola (Firestore > Indices). Las colecciones estan vacias, deberian quedar listos en minutos. La politica TTL tambien se confirma en la consola (Firestore > TTL).

## Humo de seguridad (sin credenciales)
| Peticion | HTTP |
|---|---|
| Firestore REST `/documents/orders` | 403 |
| `/documents/counters` | 403 |
| `/documents/settings/private` | 403 |
| `/documents/products` (sin filtros) | 403 |
| Storage `.../b/nutraelements.firebasestorage.app/o` | 403 |

Ningun 200. Nada critico.

## Pendiente (C3 y otros)
- C3: `npm run test:rules` sigue sin ejecutarse (sin Java/emuladores). No declarar reglas "probadas".
- M3: restringir la clave web de apphosting.yaml en Google Cloud y activar App Check.
- Para tech-lead: B1 (storage.rules permite update ademas de create) sigue desplegado tal cual; decidir si firebase-architect lo corrige.

## Reversa
Si algo falla en produccion: crear un archivo temporal fuera del repo (o ajustar uno) con `rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /{document=**} { allow read, write: if false; } } }` y analogo para Storage (`service firebase.storage { match /b/{b}/o { match /{allPaths=**} { allow read, write: if false; } } }`), y desplegarlo con `firebase deploy --project nutraelements --only firestore:rules,storage` (con confirmacion de Carlos). Tambien se puede volver a una version previa desde la consola (Reglas > historial). Los indices no requieren reversa (solo suman).
